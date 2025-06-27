/**
 * Roadmap Service - AI-powered roadmap and milestone generation
 *
 * This service contains the logic for the Planner AI and Coach AI systems.
 * It integrates with Amazon Bedrock to generate personalized roadmaps and
 * daily quests for user goals.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Goal, Milestone, Task } from '../types';
import { BedrockError, ValidationError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

/**
 * Interface for the Planner AI response
 */
interface PlannerResponse {
    milestones: Array<{
        title: string;
        description: string;
        durationInDays: number;
    }>;
}

/**
 * Interface for the Coach AI response
 */
interface CoachResponse {
    dailyQuests: Array<{
        taskName: string;
        description: string;
        priority: 'low' | 'medium' | 'high';
    }>;
}

/**
 * Generate a personalized roadmap for an Epic Quest using the Planner AI
 */
export async function generateRoadmapForEpic(epicQuest: Goal): Promise<Milestone[]> {
    try {
        Logger.info('Generating roadmap for epic quest', {
            goalId: epicQuest.goalId,
            goalName: epicQuest.goalName,
        });

        // Construct the master prompt for the Planner AI
        const prompt = buildPlannerPrompt(epicQuest);

        // Call Bedrock Claude 3 Haiku
        const response = await callBedrock(prompt);

        // Parse the JSON response
        const plannerResponse = parseBedrockResponse(response) as PlannerResponse;

        // Validate the response structure
        if (!plannerResponse.milestones || !Array.isArray(plannerResponse.milestones)) {
            throw new ValidationError('Invalid roadmap response format');
        }

        // Convert the AI response to Milestone objects
        const milestones: Milestone[] = plannerResponse.milestones.map((milestone, index) => ({
            epicId: epicQuest.goalId,
            sequence: index + 1,
            milestoneId: `milestone_${uuidv4()}`,
            userId: epicQuest.userId,
            title: milestone.title,
            description: milestone.description,
            status: index === 0 ? 'active' : 'locked', // First milestone is active, rest are locked
            durationInDays: milestone.durationInDays,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }));

        Logger.info('Roadmap generated successfully', {
            goalId: epicQuest.goalId,
            milestonesCount: milestones.length,
        });

        return milestones;
    } catch (error: any) {
        Logger.error('Error generating roadmap for epic', {
            error: error.message,
            goalId: epicQuest.goalId,
        });
        throw error;
    }
}

/**
 * Generate daily quests for a specific milestone using the Coach AI
 */
export async function generateDailyQuestsForMilestone(
    milestone: Milestone,
    epicQuest: Goal
): Promise<Task[]> {
    try {
        Logger.info('Generating daily quests for milestone', {
            milestoneId: milestone.milestoneId,
            epicId: milestone.epicId,
            sequence: milestone.sequence,
        });

        // Construct the prompt for the Coach AI
        const prompt = buildCoachPrompt(milestone, epicQuest);

        // Call Bedrock Claude 3 Haiku
        const response = await callBedrock(prompt);

        // Parse the JSON response
        const coachResponse = parseBedrockResponse(response) as CoachResponse;

        // Validate the response structure
        if (!coachResponse.dailyQuests || !Array.isArray(coachResponse.dailyQuests)) {
            throw new ValidationError('Invalid daily quests response format');
        }

        // Convert the AI response to Task objects
        const today = new Date();
        const tasks: Task[] = coachResponse.dailyQuests.map((quest, index) => {
            const dueDate = new Date(today);
            dueDate.setDate(today.getDate() + index);

            return {
                userId: milestone.userId,
                taskId: `task_${uuidv4()}`,
                taskName: quest.taskName,
                description: quest.description,
                dueDate: dueDate.toISOString().split('T')[0], // YYYY-MM-DD format
                priority: quest.priority,
                status: 'pending',
                goalId: milestone.epicId,
                milestoneId: milestone.milestoneId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        });

        Logger.info('Daily quests generated successfully', {
            milestoneId: milestone.milestoneId,
            tasksCount: tasks.length,
        });

        return tasks;
    } catch (error: any) {
        Logger.error('Error generating daily quests for milestone', {
            error: error.message,
            milestoneId: milestone.milestoneId,
        });
        throw error;
    }
}

/**
 * Build the master prompt for the Planner AI
 */
function buildPlannerPrompt(epicQuest: Goal): string {
    return `You are Zik, an intelligent AI life coach specializing in breaking down complex goals into achievable roadmaps.

Your task is to create a personalized, step-by-step roadmap for the following Epic Quest:

**Goal:** ${epicQuest.goalName}
**Description:** ${epicQuest.description || 'No additional description provided'}
**Target Date:** ${epicQuest.targetDate || 'No specific target date'}
**Category:** ${epicQuest.category || 'General'}

Create a roadmap of 3-7 milestones that will help the user achieve this goal. Each milestone should:
1. Be specific and actionable
2. Build upon the previous milestone
3. Have a realistic duration estimate
4. Be motivating and achievable

Respond with ONLY a valid JSON object in this exact format:
{
  "milestones": [
    {
      "title": "Week 1: Foundation Building",
      "description": "Detailed description of what to focus on",
      "durationInDays": 7
    }
  ]
}

Make the roadmap personalized, practical, and inspiring. Focus on creating momentum with early wins while building toward the ultimate goal.`;
}

/**
 * Build the prompt for the Coach AI
 */
function buildCoachPrompt(milestone: Milestone, epicQuest: Goal): string {
    return `You are Zik, an intelligent AI life coach specializing in creating actionable daily tasks.

Your task is to create daily quests for the following milestone:

**Epic Quest:** ${epicQuest.goalName}
**Milestone:** ${milestone.title}
**Milestone Description:** ${milestone.description}
**Duration:** ${milestone.durationInDays} days

Create ${Math.min(milestone.durationInDays, 14)} daily quests that will help the user complete this milestone. Each quest should:
1. Be specific and actionable (can be completed in 30-90 minutes)
2. Build toward the milestone objective
3. Be motivating and achievable
4. Progress logically from day to day

Respond with ONLY a valid JSON object in this exact format:
{
  "dailyQuests": [
    {
      "taskName": "Research basic guitar chords",
      "description": "Spend 30 minutes learning about G, C, and D chords using online resources",
      "priority": "medium"
    }
  ]
}

Make the daily quests engaging, practical, and perfectly sized for daily completion.`;
}

/**
 * Call Amazon Bedrock with the given prompt
 */
async function callBedrock(prompt: string): Promise<string> {
    try {
        const command = new InvokeModelCommand({
            modelId: MODEL_ID,
            contentType: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 2000,
                temperature: 0.7,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        const response = await bedrockClient.send(command);

        if (!response.body) {
            throw new BedrockError('Empty response from Bedrock');
        }

        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        if (!responseBody.content || !responseBody.content[0]?.text) {
            throw new BedrockError('Invalid response structure from Bedrock');
        }

        return responseBody.content[0].text;
    } catch (error: any) {
        Logger.error('Error calling Bedrock', { error: error.message });
        throw new BedrockError(`Failed to call Bedrock: ${error.message}`);
    }
}

/**
 * Parse and validate Bedrock JSON response
 */
function parseBedrockResponse(response: string): any {
    try {
        // Extract JSON from the response (handle cases where there might be extra text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
    } catch (error: any) {
        Logger.error('Error parsing Bedrock response', {
            error: error.message,
            response: response.substring(0, 500), // Log first 500 chars for debugging
        });
        throw new ValidationError('Failed to parse AI response');
    }
}
