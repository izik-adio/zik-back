/**
 * Tool execution service for managing quest operations
 *
 * This service acts as the bridge between AI tool calls and database operations.
 * It supports both read operations (get_quests) and write operations (modify_quest)
 * to enable the AI to act as an intelligent coach rather than a rigid command interpreter.
 */
import { ToolInput } from '../types';
import { ValidationError } from '../utils/errors';
import { Logger } from '../utils/logger';
import {
  createGoal,
  updateGoal,
  deleteGoal,
  fetchActiveGoals,
} from './database/goals';
import {
  createTask,
  updateTask,
  deleteTask,
  fetchTodayTasks,
  fetchTasksByMilestone,
  getTaskById,
} from './database/tasks';
import {
  createRecurrenceRule,
  updateRecurrenceRule,
  deleteRecurrenceRule,
} from './database/recurrenceRules';
import {
  getMilestonesByEpicId,
  getNextMilestone,
  updateMilestone,
} from './database/milestones';
import {
  startRoadmapGeneration,
  generateDailyQuestsForMilestone,
  isComplexGoal,
} from './stepFunctionService';

/**
 * Validates and executes tool operations for quest management
 *
 * This function processes AI tool calls and translates them into appropriate
 * database operations. It now supports both read and write operations to enable
 * the AI to gather information intelligently and perform actions as needed.
 *
 * @param userId - The authenticated user's ID from JWT token
 * @param toolName - The name of the tool being called ('get_quests' or 'modify_quest')
 * @param toolInput - The tool parameters parsed from AI response
 * @returns Promise<string> - User-friendly response for the frontend or tool result data
 * @throws ValidationError - If input validation fails or required fields are missing
 * @throws DatabaseError - If database operation fails
 * @throws NotFoundError - If attempting to update/delete non-existent quest
 */
export async function executeTool(
  userId: string,
  toolName: string,
  toolInput: ToolInput
): Promise<string> {
  Logger.info('Tool execution requested', {
    userId,
    toolName,
    toolInput: JSON.stringify(toolInput),
  });

  try {
    switch (toolName) {
      case 'get_quests':
        return await executeGetQuests(userId, toolInput);
      case 'modify_quest':
        return await executeModifyQuest(userId, toolInput);
      default:
        throw new ValidationError(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    Logger.error('Tool execution failed', error, {
      toolName,
      userId,
    });
    throw error;
  }
}

/**
 * Executes get_quests tool to retrieve quest information
 * @param userId - The authenticated user's ID
 * @param toolInput - The query parameters
 * @returns Promise<string> - JSON string containing the requested quest data
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
async function executeGetQuests(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  const { questType, questId, epicId, dueDate, status } = toolInput;

  Logger.info('Executing get_quests', {
    userId,
    questType,
    questId,
    epicId,
    dueDate,
    status,
  });

  try {
    if (questType === 'epic') {
      // Fetch goals/epic quests
      const goals = await fetchActiveGoals(userId);

      // Filter by specific questId if provided
      if (questId) {
        const goal = goals.find((g) => g.goalId === questId);
        return JSON.stringify({
          type: 'epic_quests',
          data: goal ? [goal] : [],
          count: goal ? 1 : 0,
        });
      }

      // Filter by status if provided
      let filteredGoals = goals;
      if (status) {
        filteredGoals = goals.filter((g) => g.status === status);
      }

      return JSON.stringify({
        type: 'epic_quests',
        data: filteredGoals,
        count: filteredGoals.length,
      });
    } else if (questType === 'daily') {
      // Fetch tasks/daily quests
      let tasks;

      if (dueDate) {
        // If specific date provided, we'd need a new function to fetch by date
        // For now, fetch today's tasks and filter
        tasks = await fetchTodayTasks(userId);
        tasks = tasks.filter((t) => t.dueDate === dueDate);
      } else {
        // Fetch today's tasks by default
        tasks = await fetchTodayTasks(userId);
      }

      // Filter by specific questId if provided
      if (questId) {
        tasks = tasks.filter((t) => t.taskId === questId);
      }

      // Filter by epicId if provided
      if (epicId) {
        tasks = tasks.filter((t) => t.goalId === epicId);
      }

      // Filter by status if provided
      if (status) {
        tasks = tasks.filter((t) => t.status === status);
      }

      return JSON.stringify({
        type: 'daily_quests',
        data: tasks,
        count: tasks.length,
      });
    } else {
      throw new ValidationError(
        `Unknown quest type for get_quests: ${questType}`
      );
    }
  } catch (error) {
    Logger.error('Failed to execute get_quests', error, {
      userId,
      questType,
    });
    throw error;
  }
}

/**
 * Executes modify_quest tool to create, update, or delete quests
 * @param userId - The authenticated user's ID
 * @param toolInput - The modification parameters
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
async function executeModifyQuest(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  // Validate required fields for modify_quest
  if (!toolInput.operation || !toolInput.questType) {
    throw new ValidationError(
      'Tool input missing required fields: operation and questType'
    );
  }

  Logger.info('Executing modify_quest', {
    operation: toolInput.operation,
    questType: toolInput.questType,
    userId,
  });

  const { operation, questType } = toolInput;

  try {
    switch (operation) {
      case 'create':
        return await createQuest(userId, toolInput);
      case 'update':
        return await updateQuest(userId, toolInput);
      case 'delete':
        return await deleteQuest(userId, toolInput);
      default:
        throw new ValidationError(`Unknown operation: ${operation}`);
    }
  } catch (error) {
    Logger.error('Failed to execute modify_quest', error, {
      operation,
      questType,
      userId,
    });
    throw error;
  }
}

/**
 * Creates a new quest (goal or task) in the database
 * @param userId - The authenticated user's ID
 * @param toolInput - The creation parameters
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws DatabaseError - If database operation fails
 */
async function createQuest(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  const { questType, title, dueDate, epicId, frequency, daysOfWeek } =
    toolInput;

  if (questType === 'epic') {
    if (!title) {
      throw new ValidationError('Title is required for creating an epic quest');
    }

    // Create the goal first
    const result = await createGoal(userId, title);
    const { message, goalId } = result;

    // All Epic Quests should get roadmap generation
    try {
      // Update the goal to indicate roadmap is being generated
      await updateGoal(userId, goalId, { roadmapStatus: 'generating' });

      // Start the roadmap generation workflow asynchronously
      await startRoadmapGeneration(goalId, userId);

      Logger.info('Roadmap generation triggered for Epic Quest', {
        goalId,
        userId,
        title,
      });

      // Return enhanced message indicating roadmap generation
      return `${message} 🚀 I'm now generating a personalized roadmap with milestones and tasks to help you achieve this goal!`;
    } catch (roadmapError: any) {
      // Log the error but don't fail the goal creation
      Logger.error('Failed to trigger roadmap generation', {
        error: roadmapError.message,
        userId,
        title,
      });

      // Return the original message if roadmap generation fails
      return `${message} ⚠️ Goal created successfully, but roadmap generation encountered an issue. You can still add tasks manually!`;
    }
  } else if (questType === 'daily') {
    if (!title) {
      throw new ValidationError('Title is required for creating a daily quest');
    }

    // Extract description from updateFields if provided
    const description = toolInput.updateFields?.description;

    return await createTask(userId, title, dueDate, epicId, description);
  } else if (questType === 'recurrence') {
    if (!title || !frequency) {
      throw new ValidationError(
        'Title and frequency are required for creating a recurrence rule'
      );
    }
    return await createRecurrenceRule(userId, title, frequency, {
      goalId: epicId,
      daysOfWeek,
    });
  }

  throw new ValidationError(`Unknown quest type: ${questType}`);
}

/**
 * Updates an existing quest (goal or task) in the database
 * @param userId - The authenticated user's ID
 * @param toolInput - The update parameters
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If quest doesn't exist
 * @throws DatabaseError - If database operation fails
 */
async function updateQuest(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  const { questType, questId, updateFields } = toolInput;

  if (!questId) {
    throw new ValidationError('Quest ID is required for update operation');
  }

  if (!updateFields) {
    throw new ValidationError(
      'Update fields are required for update operation'
    );
  }

  if (questType === 'epic') {
    return await updateGoal(userId, questId, updateFields);
  } else if (questType === 'daily') {
    // Update the task
    const result = await updateTask(userId, questId, updateFields);

    // Check if this task was completed and if it triggers milestone progression
    if (updateFields.status === 'completed') {
      await checkMilestoneCompletion(userId, questId);
    }

    return result;
  } else if (questType === 'recurrence') {
    return await updateRecurrenceRule(userId, questId, updateFields);
  }

  throw new ValidationError(`Unknown quest type: ${questType}`);
}

/**
 * Deletes an existing quest (goal or task) from the database
 * @param userId - The authenticated user's ID
 * @param toolInput - The deletion parameters
 * @returns Promise<string> - Success confirmation message
 * @throws ValidationError - If input validation fails
 * @throws NotFoundError - If quest doesn't exist
 * @throws DatabaseError - If database operation fails
 */
async function deleteQuest(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  const { questType, questId } = toolInput;

  if (!questId) {
    throw new ValidationError('Quest ID is required for delete operation');
  }

  if (questType === 'epic') {
    return await deleteGoal(userId, questId);
  } else if (questType === 'daily') {
    return await deleteTask(userId, questId);
  } else if (questType === 'recurrence') {
    return await deleteRecurrenceRule(userId, questId);
  }

  throw new ValidationError(`Unknown quest type: ${questType}`);
}

/**
 * Checks if completing a task triggers milestone completion and progression
 * @param userId - The authenticated user's ID
 * @param taskId - The ID of the completed task
 */
async function checkMilestoneCompletion(
  userId: string,
  taskId: string
): Promise<void> {
  try {
    // First, get the task to find its milestoneId
    const completedTask = await getTaskById(userId, taskId);

    if (!completedTask || !completedTask.milestoneId) {
      // Task is not part of a milestone, nothing to check
      return;
    }

    const { milestoneId, goalId } = completedTask;

    if (!goalId) {
      Logger.warn('Task has milestoneId but no goalId', {
        taskId,
        milestoneId,
      });
      return;
    }

    // Get all tasks for this milestone
    const milestoneTasks = await fetchTasksByMilestone(userId, milestoneId);

    // Check if all tasks for this milestone are completed
    const pendingTasks = milestoneTasks.filter(
      (task) => task.status === 'pending' || task.status === 'in-progress'
    );

    if (pendingTasks.length === 0) {
      // All tasks for this milestone are completed!
      Logger.info('Milestone completed, triggering progression', {
        userId,
        milestoneId,
        goalId,
      });

      // Get all milestones for this epic to find the current sequence
      const milestones = await getMilestonesByEpicId(goalId);
      const currentMilestone = milestones.find(
        (m) => m.milestoneId === milestoneId
      );

      if (!currentMilestone) {
        Logger.error('Could not find current milestone', {
          milestoneId,
          goalId,
        });
        return;
      }

      // Mark current milestone as completed
      await updateMilestone(goalId, currentMilestone.sequence, {
        status: 'completed',
      });

      // Find and activate the next milestone
      const nextMilestone = await getNextMilestone(
        goalId,
        currentMilestone.sequence
      );

      if (nextMilestone) {
        // Activate the next milestone
        await updateMilestone(goalId, nextMilestone.sequence, {
          status: 'active',
        });

        // Generate daily quests for the next milestone
        await generateDailyQuestsForMilestone(
          goalId,
          nextMilestone.sequence,
          userId
        );

        Logger.info('Next milestone activated and quests generated', {
          userId,
          goalId,
          nextMilestoneId: nextMilestone.milestoneId,
          nextSequence: nextMilestone.sequence,
        });
      } else {
        // No more milestones - the entire epic quest is complete!
        await updateGoal(userId, goalId, { status: 'completed' });

        Logger.info('Epic quest completed - all milestones finished', {
          userId,
          goalId,
        });
      }
    }
  } catch (error: any) {
    // Log the error but don't fail the task update
    Logger.error('Error checking milestone completion', {
      error: error.message,
      userId,
      taskId,
    });
  }
}
