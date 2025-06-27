/**
 * Step Function Service - Interface for triggering Step Function workflows
 *
 * This service provides methods to start the roadmap generation workflow
 * and other Step Function executions.
 */

import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { Logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const sfnClient = new SFNClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const ROADMAP_GENERATOR_WORKFLOW_ARN = process.env.ROADMAP_GENERATOR_WORKFLOW_ARN;
const DAILY_QUEST_GENERATOR_LAMBDA_ARN = process.env.DAILY_QUEST_GENERATOR_LAMBDA_ARN;

/**
 * Interface for roadmap generation input
 */
interface RoadmapGenerationInput {
    goalId: string;
    userId: string;
}

/**
 * Interface for daily quest generation input
 */
interface DailyQuestGenerationInput {
    epicId: string;
    sequence: number;
    userId: string;
}

/**
 * Start the roadmap generation workflow for an Epic Quest
 */
export async function startRoadmapGeneration(
    goalId: string,
    userId: string
): Promise<string> {
    try {
        if (!ROADMAP_GENERATOR_WORKFLOW_ARN) {
            throw new ValidationError('Roadmap generator workflow ARN not configured');
        }

        const input: RoadmapGenerationInput = {
            goalId,
            userId,
        };

        const command = new StartExecutionCommand({
            stateMachineArn: ROADMAP_GENERATOR_WORKFLOW_ARN,
            input: JSON.stringify(input),
            name: `roadmap-gen-${goalId}-${Date.now()}`, // Unique execution name
        });

        const result = await sfnClient.send(command);

        Logger.info('Roadmap generation workflow started', {
            goalId,
            userId,
            executionArn: result.executionArn,
        });

        return result.executionArn!;
    } catch (error: any) {
        Logger.error('Failed to start roadmap generation workflow', {
            error: error.message,
            goalId,
            userId,
        });
        throw error;
    }
}

/**
 * Invoke the daily quest generator Lambda directly for milestone progression
 */
export async function generateDailyQuestsForMilestone(
    epicId: string,
    sequence: number,
    userId: string
): Promise<void> {
    try {
        if (!DAILY_QUEST_GENERATOR_LAMBDA_ARN) {
            throw new ValidationError('Daily quest generator Lambda ARN not configured');
        }

        const input: DailyQuestGenerationInput = {
            epicId,
            sequence,
            userId,
        };

        const command = new InvokeCommand({
            FunctionName: DAILY_QUEST_GENERATOR_LAMBDA_ARN,
            InvocationType: 'Event', // Asynchronous invocation
            Payload: JSON.stringify(input),
        });

        await lambdaClient.send(command);

        Logger.info('Daily quest generation invoked', {
            epicId,
            sequence,
            userId,
        });
    } catch (error: any) {
        Logger.error('Failed to invoke daily quest generation', {
            error: error.message,
            epicId,
            sequence,
            userId,
        });
        throw error;
    }
}

/**
 * Check if a goal title indicates it's complex enough to warrant roadmap generation
 * This is a simple heuristic - in production you might want more sophisticated logic
 */
export function isComplexGoal(goalTitle: string): boolean {
    const complexIndicators = [
        'learn',
        'master',
        'become',
        'build',
        'create',
        'develop',
        'achieve',
        'complete',
        'finish',
        'start',
        'begin',
        'launch',
        'establish',
        'improve',
        'enhance',
        'advance',
        'train',
        'study',
        'practice',
        'prepare',
        'plan',
        'organize',
        'transform',
        'change',
        'growth',
        'skill',
        'career',
        'business',
        'project',
        'habit',
        'routine',
        'lifestyle',
        'health',
        'fitness',
        'weight',
        'muscle',
        'strength',
        'endurance',
        'marathon',
        'certification',
        'degree',
        'course',
        'language',
        'instrument',
        'art',
        'writing',
        'reading',
        'coding',
        'programming',
        'website',
        'app',
        'software',
    ];

    const title = goalTitle.toLowerCase();

    // Check for length (longer titles are typically more complex)
    if (title.length > 15) return true;

    // Check for complex indicators
    const hasComplexIndicator = complexIndicators.some(indicator =>
        title.includes(indicator)
    );

    return hasComplexIndicator;
}
