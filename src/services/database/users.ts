/**
 * Database operations for User profiles management
 */
import { GetCommand, QueryCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './client';
import { config } from '../../config';
import { UserProfile, CreateProfileRequest, UpdateProfileRequest, UserPreferences } from '../../types';
import { DatabaseError, ValidationError } from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Default user preferences for new profiles
 */
const DEFAULT_PREFERENCES: UserPreferences = {
    theme: 'system',
    notifications: {
        email: true,
        push: true,
        dailyReminders: true,
        weeklyDigest: true,
    },
    timezone: 'UTC',
    language: 'en',
    questCategories: [],
    privacySettings: {
        shareProgress: false,
        publicProfile: false,
    },
};

/**
 * Fetches user profile from Users table
 * @param userId - The user's unique identifier
 * @returns Promise<UserProfile | null> - User profile or null if not found
 * @throws DatabaseError - If database operation fails
 */
export async function fetchUserProfile(
    userId: string
): Promise<UserProfile | null> {
    try {
        Logger.debug('Fetching user profile', { userId });

        const command = new GetCommand({
            TableName: config.usersTableName,
            Key: { userId },
        });

        const result = await docClient.send(command);

        if (result.Item) {
            Logger.debug('User profile fetched successfully', { userId });
            return result.Item as UserProfile;
        } else {
            Logger.warn('User profile not found', { userId });
            return null;
        }
    } catch (error) {
        Logger.error('Failed to fetch user profile', error, {
            userId,
            table: config.usersTableName,
        });
        throw new DatabaseError('Failed to fetch user profile', error);
    }
}

/**
 * Checks if username is unique across all users using GSI
 * @param username - Username to check
 * @param excludeUserId - Optional userId to exclude from check (for updates)
 * @returns Promise<boolean> - True if username is unique
 * @throws DatabaseError - If database operation fails
 */
export async function isUsernameUnique(
    username: string,
    excludeUserId?: string
): Promise<boolean> {
    try {
        Logger.debug('Checking username uniqueness', {
            username,
            excludeUserId,
            tableName: config.usersTableName,
            indexName: config.usernameIndex
        });

        const command = new QueryCommand({
            TableName: config.usersTableName,
            IndexName: config.usernameIndex,
            KeyConditionExpression: 'username = :username',
            ExpressionAttributeValues: {
                ':username': username,
            },
            ProjectionExpression: 'userId',
        });

        Logger.debug('Executing DynamoDB query', {
            TableName: config.usersTableName,
            IndexName: config.usernameIndex,
            username
        });

        const result = await docClient.send(command);

        Logger.debug('DynamoDB query successful', {
            itemCount: result.Items?.length || 0
        });

        // If excludeUserId is provided, check if the found user is the excluded one
        let isUnique = !result.Items || result.Items.length === 0;

        if (!isUnique && excludeUserId && result.Items) {
            // If we found exactly one user and it's the excluded user, then it's unique for update
            isUnique = result.Items.length === 1 && result.Items[0].userId === excludeUserId;
        }

        Logger.debug('Username uniqueness check result', {
            username,
            excludeUserId,
            isUnique,
            foundCount: result.Items?.length || 0
        });

        return isUnique;
    } catch (error) {
        Logger.error('Failed to check username uniqueness', error, {
            username,
            excludeUserId,
            table: config.usersTableName,
            index: config.usernameIndex,
            errorName: (error as any)?.name,
            errorMessage: (error as any)?.message,
            errorCode: (error as any)?.$metadata?.httpStatusCode,
        });
        throw new DatabaseError('Failed to check username uniqueness', error);
    }
}

/**
 * Checks if email is unique across all users using GSI
 * @param email - Email to check
 * @param excludeUserId - Optional userId to exclude from check (for updates)
 * @returns Promise<boolean> - True if email is unique
 * @throws DatabaseError - If database operation fails
 */
export async function isEmailUnique(
    email: string,
    excludeUserId?: string
): Promise<boolean> {
    try {
        Logger.debug('Checking email uniqueness', { email, excludeUserId });

        const command = new QueryCommand({
            TableName: config.usersTableName,
            IndexName: config.emailIndex,
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase().trim(),
            },
            ProjectionExpression: 'userId',
        });

        const result = await docClient.send(command);

        // If excludeUserId is provided, check if the found user is the excluded one
        let isUnique = !result.Items || result.Items.length === 0;

        if (!isUnique && excludeUserId && result.Items) {
            // If we found exactly one user and it's the excluded user, then it's unique for update
            isUnique = result.Items.length === 1 && result.Items[0].userId === excludeUserId;
        }

        Logger.debug('Email uniqueness check result', {
            email,
            excludeUserId,
            isUnique,
            foundCount: result.Items?.length || 0
        });

        return isUnique;
    } catch (error) {
        Logger.error('Failed to check email uniqueness', error, {
            email,
            excludeUserId,
            table: config.usersTableName,
        });
        throw new DatabaseError('Failed to check email uniqueness', error);
    }
}

/**
 * Creates a new user profile in the database
 * @param userId - The authenticated user's ID (from Cognito)
 * @param email - User's email address (from Cognito)
 * @param profileData - Profile creation data
 * @returns Promise<UserProfile> - The created user profile
 * @throws ValidationError - If input validation fails or constraints are violated
 * @throws DatabaseError - If database operation fails
 */
export async function createUserProfile(
    userId: string,
    email: string,
    profileData: CreateProfileRequest
): Promise<UserProfile> {
    // Validate required fields
    if (!profileData.username || profileData.username.trim().length === 0) {
        throw new ValidationError('Username is required and cannot be empty');
    }

    if (!profileData.firstName || profileData.firstName.trim().length === 0) {
        throw new ValidationError('First name is required and cannot be empty');
    }

    if (!profileData.lastName || profileData.lastName.trim().length === 0) {
        throw new ValidationError('Last name is required and cannot be empty');
    }

    // Validate username format (alphanumeric + underscore, 3-30 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(profileData.username)) {
        throw new ValidationError('Username must be 3-30 characters and contain only letters, numbers, and underscores');
    }

    // Validate field lengths
    if (profileData.username.length > 30) {
        throw new ValidationError('Username cannot exceed 30 characters');
    }

    if (profileData.firstName.length > 50) {
        throw new ValidationError('First name cannot exceed 50 characters');
    }

    if (profileData.lastName.length > 50) {
        throw new ValidationError('Last name cannot exceed 50 characters');
    }

    if (profileData.displayName && profileData.displayName.length > 100) {
        throw new ValidationError('Display name cannot exceed 100 characters');
    }

    // Check uniqueness constraints
    const [isUsernameUniqueResult, isEmailUniqueResult] = await Promise.all([
        isUsernameUnique(profileData.username),
        isEmailUnique(email)
    ]);

    if (!isUsernameUniqueResult) {
        throw new ValidationError('Username is already taken');
    }

    if (!isEmailUniqueResult) {
        throw new ValidationError('Email is already registered');
    }

    const now = new Date().toISOString();

    // Merge provided preferences with defaults
    const preferences: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        ...profileData.preferences,
        notifications: {
            ...DEFAULT_PREFERENCES.notifications,
            ...profileData.preferences?.notifications,
        },
        privacySettings: {
            ...DEFAULT_PREFERENCES.privacySettings,
            ...profileData.preferences?.privacySettings,
        },
    };

    const userProfile: UserProfile = {
        userId,
        username: profileData.username.trim(),
        email: email.toLowerCase().trim(),
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        displayName: profileData.displayName?.trim(),
        preferences,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
    };

    try {
        Logger.debug('Creating user profile', { userId, username: profileData.username, email });

        const command = new PutCommand({
            TableName: config.usersTableName,
            Item: userProfile,
            ConditionExpression: 'attribute_not_exists(userId)', // Prevent overwriting existing profile
        });

        await docClient.send(command);

        Logger.info('User profile created successfully', {
            userId,
            username: profileData.username,
            email
        });

        return userProfile;
    } catch (error) {
        Logger.error('Failed to create user profile', error, {
            userId,
            username: profileData.username,
            email,
            table: config.usersTableName,
        });

        if ((error as any).name === 'ConditionalCheckFailedException') {
            throw new ValidationError('User profile already exists');
        }

        throw new DatabaseError('Failed to create user profile', error);
    }
}

/**
 * Updates an existing user profile
 * @param userId - The authenticated user's ID
 * @param updateData - Profile update data
 * @returns Promise<UserProfile> - The updated user profile
 * @throws ValidationError - If input validation fails or constraints are violated
 * @throws DatabaseError - If database operation fails
 */
export async function updateUserProfile(
    userId: string,
    updateData: UpdateProfileRequest
): Promise<UserProfile> {
    // Fetch current profile
    const currentProfile = await fetchUserProfile(userId);
    if (!currentProfile) {
        throw new ValidationError('User profile not found');
    }

    // Validate update data
    if (updateData.username !== undefined) {
        if (!updateData.username || updateData.username.trim().length === 0) {
            throw new ValidationError('Username cannot be empty');
        }

        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        if (!usernameRegex.test(updateData.username)) {
            throw new ValidationError('Username must be 3-30 characters and contain only letters, numbers, and underscores');
        }

        // Check if username is unique (excluding current user)
        if (updateData.username !== currentProfile.username) {
            const isUnique = await isUsernameUnique(updateData.username, userId);
            if (!isUnique) {
                throw new ValidationError('Username is already taken');
            }
        }
    }

    if (updateData.firstName !== undefined && updateData.firstName.trim().length === 0) {
        throw new ValidationError('First name cannot be empty');
    }

    if (updateData.lastName !== undefined && updateData.lastName.trim().length === 0) {
        throw new ValidationError('Last name cannot be empty');
    }

    if (updateData.firstName && updateData.firstName.length > 50) {
        throw new ValidationError('First name cannot exceed 50 characters');
    }

    if (updateData.lastName && updateData.lastName.length > 50) {
        throw new ValidationError('Last name cannot exceed 50 characters');
    }

    if (updateData.displayName && updateData.displayName.length > 100) {
        throw new ValidationError('Display name cannot exceed 100 characters');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updateData.username !== undefined) {
        updateExpressions.push('#username = :username');
        expressionAttributeNames['#username'] = 'username';
        expressionAttributeValues[':username'] = updateData.username.trim();
    }

    if (updateData.firstName !== undefined) {
        updateExpressions.push('#firstName = :firstName');
        expressionAttributeNames['#firstName'] = 'firstName';
        expressionAttributeValues[':firstName'] = updateData.firstName.trim();
    }

    if (updateData.lastName !== undefined) {
        updateExpressions.push('#lastName = :lastName');
        expressionAttributeNames['#lastName'] = 'lastName';
        expressionAttributeValues[':lastName'] = updateData.lastName.trim();
    }

    if (updateData.displayName !== undefined) {
        updateExpressions.push('#displayName = :displayName');
        expressionAttributeNames['#displayName'] = 'displayName';
        expressionAttributeValues[':displayName'] = updateData.displayName?.trim() || null;
    }

    if (updateData.avatarUrl !== undefined) {
        updateExpressions.push('#avatarUrl = :avatarUrl');
        expressionAttributeNames['#avatarUrl'] = 'avatarUrl';
        expressionAttributeValues[':avatarUrl'] = updateData.avatarUrl?.trim() || null;
    }

    if (updateData.preferences !== undefined) {
        // Merge preferences with existing ones
        const mergedPreferences: UserPreferences = {
            ...currentProfile.preferences,
            ...updateData.preferences,
            notifications: {
                ...currentProfile.preferences.notifications,
                ...updateData.preferences.notifications,
            },
            privacySettings: {
                ...currentProfile.preferences.privacySettings,
                ...updateData.preferences.privacySettings,
            },
        };

        updateExpressions.push('#preferences = :preferences');
        expressionAttributeNames['#preferences'] = 'preferences';
        expressionAttributeValues[':preferences'] = mergedPreferences;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
        Logger.debug('Updating user profile', { userId, updateFields: Object.keys(updateData) });

        const command = new UpdateCommand({
            TableName: config.usersTableName,
            Key: { userId },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(userId)', // Ensure profile exists
            ReturnValues: 'ALL_NEW',
        });

        const result = await docClient.send(command);

        Logger.info('User profile updated successfully', {
            userId,
            updatedFields: Object.keys(updateData)
        });

        return result.Attributes as UserProfile;
    } catch (error) {
        Logger.error('Failed to update user profile', error, {
            userId,
            updateData,
            table: config.usersTableName,
        });

        if ((error as any).name === 'ConditionalCheckFailedException') {
            throw new ValidationError('User profile not found');
        }

        throw new DatabaseError('Failed to update user profile', error);
    }
}

/**
 * Updates the user's last login timestamp
 * @param userId - The authenticated user's ID
 * @returns Promise<void>
 * @throws DatabaseError - If database operation fails
 */
export async function updateLastLogin(userId: string): Promise<void> {
    try {
        Logger.debug('Updating last login timestamp', { userId });

        const command = new UpdateCommand({
            TableName: config.usersTableName,
            Key: { userId },
            UpdateExpression: 'SET lastLoginAt = :lastLoginAt',
            ExpressionAttributeValues: {
                ':lastLoginAt': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(userId)',
        });

        await docClient.send(command);

        Logger.debug('Last login timestamp updated successfully', { userId });
    } catch (error) {
        // Don't throw error for last login update failures - it's not critical
        Logger.warn('Failed to update last login timestamp', { userId, error });
    }
}

/**
 * Marks user onboarding as completed
 * @param userId - The authenticated user's ID
 * @returns Promise<void>
 * @throws DatabaseError - If database operation fails
 */
export async function completeOnboarding(userId: string): Promise<void> {
    try {
        Logger.debug('Marking onboarding as completed', { userId });

        const command = new UpdateCommand({
            TableName: config.usersTableName,
            Key: { userId },
            UpdateExpression: 'SET onboardingCompleted = :completed, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':completed': true,
                ':updatedAt': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(userId)',
        });

        await docClient.send(command);

        Logger.info('User onboarding marked as completed', { userId });
    } catch (error) {
        Logger.error('Failed to complete onboarding', error, {
            userId,
            table: config.usersTableName,
        });

        if ((error as any).name === 'ConditionalCheckFailedException') {
            throw new ValidationError('User profile not found');
        }

        throw new DatabaseError('Failed to complete onboarding', error);
    }
}

/**
 * Deletes a user profile (for account deletion)
 * @param userId - The authenticated user's ID
 * @returns Promise<void>
 * @throws DatabaseError - If database operation fails
 */
export async function deleteUserProfile(userId: string): Promise<void> {
    try {
        Logger.debug('Deleting user profile', { userId });

        const command = new UpdateCommand({
            TableName: config.usersTableName,
            Key: { userId },
            UpdateExpression: 'SET #deleted = :deleted, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#deleted': 'deleted',
            },
            ExpressionAttributeValues: {
                ':deleted': true,
                ':updatedAt': new Date().toISOString(),
            },
            ConditionExpression: 'attribute_exists(userId)',
        });

        await docClient.send(command);

        Logger.info('User profile marked as deleted', { userId });
    } catch (error) {
        Logger.error('Failed to delete user profile', error, {
            userId,
            table: config.usersTableName,
        });

        if ((error as any).name === 'ConditionalCheckFailedException') {
            throw new ValidationError('User profile not found');
        }

        throw new DatabaseError('Failed to delete user profile', error);
    }
}
