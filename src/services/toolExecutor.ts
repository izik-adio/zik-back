/**
 * Tool execution service for managing quest operations
 *
 * This service acts as the bridge between AI tool calls and database operations.
 * It validates tool inputs from the AI and executes the appropriate CRUD operations
 * on goals (Epic Quests) and tasks (Daily Quests).
 */
import { ToolInput } from '../types';
import { ValidationError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { createGoal, updateGoal, deleteGoal } from './database/goals';
import { createTask, updateTask, deleteTask } from './database/tasks';

/**
 * Validates and executes tool operations for quest management
 *
 * This function processes AI tool calls and translates them into appropriate
 * database operations. It includes comprehensive validation and error handling
 * to ensure data integrity and user security.
 *
 * @param userId - The authenticated user's ID from JWT token
 * @param toolInput - The tool parameters parsed from AI response
 * @returns Promise<string> - User-friendly confirmation message for the frontend
 * @throws ValidationError - If input validation fails or required fields are missing
 * @throws DatabaseError - If database operation fails
 * @throws NotFoundError - If attempting to update/delete non-existent quest
 */
export async function executeTool(
  userId: string,
  toolInput: ToolInput
): Promise<string> {
  // Debug logging to see exactly what we received
  Logger.info('Raw tool input received', {
    userId,
    toolInput: JSON.stringify(toolInput),
    hasOperation: !!toolInput.operation,
    hasQuestType: !!toolInput.questType,
    inputKeys: Object.keys(toolInput || {}),
  });

  // Validate required fields
  if (!toolInput.operation || !toolInput.questType) {
    throw new ValidationError(
      'Tool input missing required fields: operation and questType'
    );
  }

  Logger.info('Bedrock tool call received', {
    tool: 'manage_quest',
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
    Logger.error('Tool execution failed', error, {
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
  const { questType, title, dueDate, epicId } = toolInput;

  if (questType === 'epic') {
    if (!title) {
      throw new ValidationError('Title is required for creating an epic quest');
    }
    return await createGoal(userId, title);
  } else if (questType === 'daily') {
    if (!title) {
      throw new ValidationError('Title is required for creating a daily quest');
    }
    return await createTask(userId, title, dueDate, epicId);
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
    return await updateTask(userId, questId, updateFields);
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
  }

  throw new ValidationError(`Unknown quest type: ${questType}`);
}
