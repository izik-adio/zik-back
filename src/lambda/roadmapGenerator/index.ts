/**
 * Roadmap Generator Lambda
 * 
 * This Lambda function is part of the RoadmapGeneratorWorkflow Step Function.
 * It takes an Epic Quest (Goal) and generates a personalized roadmap of milestones
 * using the Planner AI via Amazon Bedrock.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '../../utils/logger';
import { createSuccessResponse, createErrorResponse } from '../../utils/responses';
import { generateRoadmapForEpic } from '../../services/roadmapService';
import { getGoalById } from '../../services/database/goals';
import { Goal } from '../../types';
import { ValidationError, NotFoundError } from '../../utils/errors';

interface RoadmapGeneratorInput {
    goalId: string;
    userId: string;
}

export async function handler(event: any): Promise<any> {
    const requestId = event.requestId || 'step-function-request';

    try {
        Logger.info('Roadmap generator started', { requestId, event });

        // Parse input from Step Function
        const input = event as RoadmapGeneratorInput;

        if (!input.goalId || !input.userId) {
            throw new ValidationError('goalId and userId are required');
        }

        // Fetch the Epic Quest from database
        const epicQuest = await getGoalById(input.userId, input.goalId);

        if (!epicQuest) {
            throw new NotFoundError('Epic Quest not found');
        }

        // Generate the roadmap using Planner AI
        const milestones = await generateRoadmapForEpic(epicQuest);

        Logger.info('Roadmap generated successfully', {
            requestId,
            goalId: input.goalId,
            milestonesCount: milestones.length,
        });

        // Return the milestones for the next step in the workflow
        return {
            statusCode: 200,
            goalId: input.goalId,
            userId: input.userId,
            milestones,
        };
    } catch (error: any) {
        Logger.error('Error in roadmap generator', {
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
