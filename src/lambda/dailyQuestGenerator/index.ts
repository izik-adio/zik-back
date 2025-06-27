/**
 * Daily Quest Generator Lambda
 * 
 * This Lambda function generates daily quests for a specific milestone using the Coach AI.
 * It can be invoked as part of the Step Function workflow (initial generation) or
 * triggered when a milestone is completed (ongoing generation).
 */

import { Logger } from '../../utils/logger';
import { generateDailyQuestsForMilestone } from '../../services/roadmapService';
import { getMilestoneBySequence } from '../../services/database/milestones';
import { getGoalById } from '../../services/database/goals';
import { createTasksBatch } from '../../services/database/tasks';
import { Milestone, Task } from '../../types';
import { ValidationError, NotFoundError } from '../../utils/errors';

interface DailyQuestGeneratorInput {
    milestoneId?: string;
    epicId?: string;
    sequence?: number;
    userId: string;
    firstMilestone?: Milestone; // For Step Function input
}

export async function handler(event: any): Promise<any> {
    const requestId = event.requestId || 'lambda-request';

    try {
        Logger.info('Daily quest generator started', { requestId, event });

        // Parse input - can come from Step Function or direct invocation
        const input = event as DailyQuestGeneratorInput;

        if (!input.userId) {
            throw new ValidationError('userId is required');
        }

        let milestone: Milestone | null = null;

        // Get milestone from different input sources
        if (input.firstMilestone) {
            // Coming from Step Function workflow
            milestone = input.firstMilestone;
        } else if (input.milestoneId) {
            // TODO: Implement getMilestoneById if needed
            throw new ValidationError('Getting milestone by ID not yet implemented');
        } else if (input.epicId && input.sequence !== undefined) {
            // Coming from direct invocation (milestone progression)
            milestone = await getMilestoneBySequence(input.epicId, input.sequence);
        } else {
            throw new ValidationError('Either firstMilestone, milestoneId, or (epicId + sequence) is required');
        }

        if (!milestone) {
            throw new NotFoundError('Milestone not found');
        }

        // Get the parent Epic Quest
        const epicQuest = await getGoalById(input.userId, milestone.epicId);

        if (!epicQuest) {
            throw new NotFoundError('Epic Quest not found');
        }

        // Generate daily quests using Coach AI
        const dailyQuests = await generateDailyQuestsForMilestone(milestone, epicQuest);

        // Save daily quests to database
        const savedTasks = await createTasksBatch(
            dailyQuests.map(quest => ({
                userId: quest.userId,
                taskName: quest.taskName,
                description: quest.description,
                dueDate: quest.dueDate,
                priority: quest.priority,
                status: quest.status,
                goalId: quest.goalId,
                milestoneId: quest.milestoneId,
            }))
        );

        Logger.info('Daily quests generated successfully', {
            requestId,
            milestoneId: milestone.milestoneId,
            epicId: milestone.epicId,
            sequence: milestone.sequence,
            tasksCount: savedTasks.length,
        });

        return {
            statusCode: 200,
            milestoneId: milestone.milestoneId,
            epicId: milestone.epicId,
            sequence: milestone.sequence,
            tasksGenerated: savedTasks.length,
        };
    } catch (error: any) {
        Logger.error('Error in daily quest generator', {
            requestId,
            error: error.message,
            stack: error.stack,
        });

        // Return error
        return {
            statusCode: 500,
            error: error.message,
        };
    }
}
