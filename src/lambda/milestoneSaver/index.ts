/**
 * Milestone Saver Lambda
 * 
 * This Lambda function is part of the RoadmapGeneratorWorkflow Step Function.
 * It takes the generated milestones and saves them to the MilestonesTable.
 */

import { Logger } from '../../utils/logger';
import { createMilestonesBatch } from '../../services/database/milestones';
import { updateGoal } from '../../services/database/goals';
import { Milestone } from '../../types';
import { ValidationError } from '../../utils/errors';

interface MilestoneSaverInput {
    statusCode: number;
    goalId: string;
    userId: string;
    milestones: Milestone[];
}

export async function handler(event: any): Promise<any> {
    const requestId = event.requestId || 'step-function-request';

    try {
        Logger.info('Milestone saver started', { requestId, event });

        // Parse input from previous step
        const input = event as MilestoneSaverInput;

        if (input.statusCode !== 200) {
            throw new Error('Previous step failed');
        }

        if (!input.goalId || !input.userId || !input.milestones) {
            throw new ValidationError('goalId, userId, and milestones are required');
        }

        // Save milestones to database
        const savedMilestones = await createMilestonesBatch(
            input.milestones.map(m => ({
                epicId: m.epicId,
                sequence: m.sequence,
                userId: m.userId,
                title: m.title,
                description: m.description,
                status: m.status,
                durationInDays: m.durationInDays,
            }))
        );

        // Update the goal's roadmap status to 'ready'
        await updateGoal(input.userId, input.goalId, {
            roadmapStatus: 'ready',
        });

        Logger.info('Milestones saved successfully', {
            requestId,
            goalId: input.goalId,
            milestonesCount: savedMilestones.length,
        });

        // Return the first milestone for the next step
        const firstMilestone = savedMilestones.find(m => m.sequence === 1);

        return {
            statusCode: 200,
            goalId: input.goalId,
            userId: input.userId,
            firstMilestone,
            totalMilestones: savedMilestones.length,
        };
    } catch (error: any) {
        Logger.error('Error in milestone saver', {
            requestId,
            error: error.message,
            stack: error.stack,
        });

        // Return error for Step Function to handle
        return {
            statusCode: 500,
            error: error.message,
        };
    }
}
