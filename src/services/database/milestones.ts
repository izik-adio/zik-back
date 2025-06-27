/**
 * Database service for managing milestone operations
 *
 * This service handles all DynamoDB operations for milestones in the roadmap system.
 * Milestones represent high-level steps in an Epic Quest's roadmap and are stored
 * with epicId as partition key and sequence as sort key for efficient querying.
 */

import {
    GetCommand,
    QueryCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from './client';
import { Milestone } from '../../types';
import { DatabaseError, NotFoundError, ValidationError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const MILESTONES_TABLE_NAME = process.env.MILESTONES_TABLE_NAME!;

/**
 * Create a new milestone in the roadmap
 */
export async function createMilestone(
    milestone: Omit<Milestone, 'milestoneId' | 'createdAt' | 'updatedAt'>
): Promise<Milestone> {
    try {
        const milestoneId = `milestone_${uuidv4()}`;
        const now = new Date().toISOString();

        const newMilestone: Milestone = {
            ...milestone,
            milestoneId,
            createdAt: now,
            updatedAt: now,
        };

        const command = new PutCommand({
            TableName: MILESTONES_TABLE_NAME,
            Item: newMilestone,
            // Prevent overwriting existing milestone with same epicId + sequence
            ConditionExpression: 'attribute_not_exists(epicId) AND attribute_not_exists(sequence)',
        });

        await docClient.send(command);

        Logger.info('Milestone created successfully', {
            milestoneId,
            epicId: milestone.epicId,
            sequence: milestone.sequence,
        });

        return newMilestone;
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') {
            throw new ValidationError('Milestone with this sequence already exists for this epic');
        }
        Logger.error('Error creating milestone', { error: error.message });
        throw new DatabaseError('Failed to create milestone');
    }
}

/**
 * Get all milestones for an epic quest, ordered by sequence
 */
export async function getMilestonesByEpicId(epicId: string): Promise<Milestone[]> {
    try {
        const command = new QueryCommand({
            TableName: MILESTONES_TABLE_NAME,
            KeyConditionExpression: 'epicId = :epicId',
            ExpressionAttributeValues: {
                ':epicId': epicId,
            },
            // Results are automatically sorted by sequence (sort key)
        });

        const result = await docClient.send(command);

        Logger.info('Retrieved milestones for epic', {
            epicId,
            count: result.Items?.length || 0,
        });

        return (result.Items || []) as Milestone[];
    } catch (error: any) {
        Logger.error('Error getting milestones by epic ID', { error: error.message, epicId });
        throw new DatabaseError('Failed to retrieve milestones');
    }
}

/**
 * Get a specific milestone by epicId and sequence
 */
export async function getMilestoneBySequence(
    epicId: string,
    sequence: number
): Promise<Milestone | null> {
    try {
        const command = new GetCommand({
            TableName: MILESTONES_TABLE_NAME,
            Key: {
                epicId,
                sequence,
            },
        });

        const result = await docClient.send(command);

        if (!result.Item) {
            return null;
        }

        return result.Item as Milestone;
    } catch (error: any) {
        Logger.error('Error getting milestone by sequence', {
            error: error.message,
            epicId,
            sequence
        });
        throw new DatabaseError('Failed to retrieve milestone');
    }
}

/**
 * Update a milestone's status or other fields
 */
export async function updateMilestone(
    epicId: string,
    sequence: number,
    updates: Partial<Omit<Milestone, 'epicId' | 'sequence' | 'milestoneId' | 'createdAt'>>
): Promise<Milestone> {
    try {
        const updateExpression: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        // Build dynamic update expression
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                updateExpression.push(`#${key} = :${key}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:${key}`] = value;
            }
        });

        // Always update the updatedAt timestamp
        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: MILESTONES_TABLE_NAME,
            Key: { epicId, sequence },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
            ConditionExpression: 'attribute_exists(epicId) AND attribute_exists(sequence)',
        });

        const result = await docClient.send(command);

        Logger.info('Milestone updated successfully', {
            epicId,
            sequence,
            updates: Object.keys(updates),
        });

        return result.Attributes as Milestone;
    } catch (error: any) {
        if (error.code === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Milestone not found');
        }
        Logger.error('Error updating milestone', {
            error: error.message,
            epicId,
            sequence
        });
        throw new DatabaseError('Failed to update milestone');
    }
}

/**
 * Delete a milestone
 */
export async function deleteMilestone(epicId: string, sequence: number): Promise<void> {
    try {
        const command = new DeleteCommand({
            TableName: MILESTONES_TABLE_NAME,
            Key: { epicId, sequence },
            ConditionExpression: 'attribute_exists(epicId) AND attribute_exists(sequence)',
        });

        await docClient.send(command);

        Logger.info('Milestone deleted successfully', { epicId, sequence });
    } catch (error: any) {
        if (error.code === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Milestone not found');
        }
        Logger.error('Error deleting milestone', {
            error: error.message,
            epicId,
            sequence
        });
        throw new DatabaseError('Failed to delete milestone');
    }
}

/**
 * Get the next milestone in sequence for progression
 */
export async function getNextMilestone(
    epicId: string,
    currentSequence: number
): Promise<Milestone | null> {
    try {
        const command = new QueryCommand({
            TableName: MILESTONES_TABLE_NAME,
            KeyConditionExpression: 'epicId = :epicId AND sequence > :currentSequence',
            ExpressionAttributeValues: {
                ':epicId': epicId,
                ':currentSequence': currentSequence,
            },
            Limit: 1, // We only want the immediate next milestone
        });

        const result = await docClient.send(command);

        if (!result.Items || result.Items.length === 0) {
            return null;
        }

        return result.Items[0] as Milestone;
    } catch (error: any) {
        Logger.error('Error getting next milestone', {
            error: error.message,
            epicId,
            currentSequence
        });
        throw new DatabaseError('Failed to retrieve next milestone');
    }
}

/**
 * Create multiple milestones in batch (for roadmap generation)
 */
export async function createMilestonesBatch(
    milestones: Omit<Milestone, 'milestoneId' | 'createdAt' | 'updatedAt'>[]
): Promise<Milestone[]> {
    try {
        const now = new Date().toISOString();
        const milestonesToCreate: Milestone[] = milestones.map(milestone => ({
            ...milestone,
            milestoneId: `milestone_${uuidv4()}`,
            createdAt: now,
            updatedAt: now,
        }));

        // For batch operations, we'll create them one by one to ensure proper error handling
        // In a production system, you might want to use DynamoDB batch operations
        const createdMilestones: Milestone[] = [];

        for (const milestone of milestonesToCreate) {
            const command = new PutCommand({
                TableName: MILESTONES_TABLE_NAME,
                Item: milestone,
            });

            await docClient.send(command);
            createdMilestones.push(milestone);
        }

        Logger.info('Milestones batch created successfully', {
            epicId: milestones[0]?.epicId,
            count: createdMilestones.length,
        });

        return createdMilestones;
    } catch (error: any) {
        Logger.error('Error creating milestones batch', { error: error.message });
        throw new DatabaseError('Failed to create milestones batch');
    }
}
