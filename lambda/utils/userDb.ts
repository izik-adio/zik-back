import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'Users';

export interface User {
  userId: string;
  email: string;
  hashedPassword: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isEmailVerified: boolean;
  refreshTokens?: string[];
  passwordResetToken?: string;
  passwordResetTokenExpiresAt?: string;
  profile?: {
    focusAreas?: string[];
    initialGoal?: string;
    isOnboarded?: boolean;
  };
}

export interface CreateUserData {
  email: string;
  hashedPassword: string;
  userName: string;
  profile?: {
    focusAreas?: string[];
    initialGoal?: string;
    isOnboarded?: boolean;
  };
}

/**
 * Create a new user
 */
export const createUser = async (userData: CreateUserData): Promise<User> => {
  const userId = randomUUID();
  const now = new Date().toISOString();

  const user: User = {
    userId,
    email: userData.email.toLowerCase(),
    hashedPassword: userData.hashedPassword,
    userName: userData.userName,
    createdAt: now,
    updatedAt: now,
    isEmailVerified: false,
    refreshTokens: [],
    profile: {
      focusAreas: userData.profile?.focusAreas || [],
      initialGoal: userData.profile?.initialGoal || '',
      isOnboarded: false,
      ...userData.profile,
    },
  };
  const command = new PutCommand({
    TableName: USERS_TABLE_NAME,
    Item: user,
    ConditionExpression: 'attribute_not_exists(email)', // Prevent duplicate emails
  });

  try {
    await docClient.send(command);
    return user;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('User with this email already exists');
    }
    throw error;
  }
};

/**
 * Get user by email
 */
export const getUserByEmail = async (email: string): Promise<User | null> => {
  const command = new QueryCommand({
    TableName: USERS_TABLE_NAME,
    IndexName: 'EmailIndex', // We'll need to create this GSI
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': email.toLowerCase(),
    },
  });

  try {
    const { Items } = await docClient.send(command);
    if (!Items || Items.length === 0) {
      return null;
    }
    return Items[0] as User;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string): Promise<User | null> => {
  const command = new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
  });

  try {
    const { Item } = await docClient.send(command);
    if (!Item) {
      return null;
    }
    return Item as User;
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    return null;
  }
};

/**
 * Update user's last login time
 */
export const updateLastLogin = async (userId: string): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
    UpdateExpression: 'SET lastLoginAt = :timestamp, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':timestamp': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};

/**
 * Add refresh token to user
 */
export const addRefreshToken = async (
  userId: string,
  refreshToken: string
): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
    UpdateExpression:
      'SET refreshTokens = list_append(if_not_exists(refreshTokens, :empty), :token), updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':token': [refreshToken],
      ':empty': [],
      ':timestamp': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};

/**
 * Remove refresh token from user
 */
export const removeRefreshToken = async (
  userId: string,
  refreshToken: string
): Promise<void> => {
  // First get current tokens
  const user = await getUserById(userId);
  if (!user || !user.refreshTokens) return;

  const updatedTokens = user.refreshTokens.filter(
    (token) => token !== refreshToken
  );
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
    UpdateExpression: 'SET refreshTokens = :tokens, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':tokens': updatedTokens,
      ':timestamp': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};

/**
 * Remove all refresh tokens for a user (logout from all devices)
 */
export const removeAllRefreshTokens = async (userId: string): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    UpdateExpression: 'SET refreshTokens = :emptyList, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':emptyList': [],
      ':timestamp': new Date().toISOString(),
    },
  });
  await docClient.send(command);
};

/**
 * Set password reset token for a user
 */
export const setPasswordResetToken = async (
  userId: string,
  token: string,
  expiresAt: Date
): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    UpdateExpression:
      'SET passwordResetToken = :token, passwordResetTokenExpiresAt = :expiresAt, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':token': token,
      ':expiresAt': expiresAt.toISOString(),
      ':timestamp': new Date().toISOString(),
    },
  });
  await docClient.send(command);
};

/**
 * Clear password reset token for a user
 */
export const clearPasswordResetToken = async (
  userId: string
): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    UpdateExpression:
      'REMOVE passwordResetToken, passwordResetTokenExpiresAt SET updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':timestamp': new Date().toISOString(),
    },
  });
  await docClient.send(command);
};

/**
 * Update user's password
 */
export const updateUserPassword = async (
  userId: string,
  hashedPassword: string
): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    UpdateExpression:
      'SET hashedPassword = :hashedPassword, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':hashedPassword': hashedPassword,
      ':timestamp': new Date().toISOString(),
    },
  });
  await docClient.send(command);
};

/**
 * Get user by password reset token
 */
export const getUserByPasswordResetToken = async (
  token: string
): Promise<User | null> => {
  // This requires a GSI on passwordResetToken
  // For simplicity, this example will query by token and then filter,
  // but a GSI is recommended for performance.
  // If you create a GSI, adjust the query accordingly.
  const queryCommand = new QueryCommand({
    TableName: USERS_TABLE_NAME,
    IndexName: 'PasswordResetTokenIndex', // ASSUMPTION: You will create this GSI
    KeyConditionExpression: 'passwordResetToken = :token',
    ExpressionAttributeValues: {
      ':token': token,
    },
  });

  try {
    const { Items } = await docClient.send(queryCommand);
    if (!Items || Items.length === 0) {
      return null;
    }
    // Assuming token is unique, return the first item.
    return Items[0] as User;
  } catch (error) {
    console.error('Error fetching user by password reset token:', error);
    // Handle cases where GSI might not exist yet during development
    if (
      (error as Error).name === 'ValidationException' ||
      (error as Error).message?.includes('Cannot query GSI')
    ) {
      console.warn(
        "Consider creating a GSI on 'passwordResetToken' for optimized queries."
      );
      // Fallback: Scan (not recommended for production, but useful for dev)
      // This part is commented out as scan is inefficient. Implement GSI.
      /*
        const scanCommand = new ScanCommand({
            TableName: USERS_TABLE_NAME,
            FilterExpression: "passwordResetToken = :token",
            ExpressionAttributeValues: { ":token": token }
        });
        const { Items: ScanItems } = await docClient.send(scanCommand);
        if (!ScanItems || ScanItems.length === 0) return null;
        return ScanItems[0] as User;
        */
    }
    return null;
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  userId: string,
  profileUpdates: Partial<User['profile']>
): Promise<void> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const updatedProfile = {
    ...user.profile,
    ...profileUpdates,
  };
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
    UpdateExpression: 'SET profile = :profile, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':profile': updatedProfile,
      ':timestamp': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};

/**
 * Verify email
 */
export const verifyUserEmail = async (userId: string): Promise<void> => {
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: {
      userId: userId,
    },
    UpdateExpression: 'SET isEmailVerified = :verified, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':verified': true,
      ':timestamp': new Date().toISOString(),
    },
  });

  await docClient.send(command);
};
