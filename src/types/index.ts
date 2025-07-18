/**
 * Shared TypeScript interfaces and types for the Zik application
 *
 * This file contains all the core data structures used throughout the Zik backend,
 * including user profiles, quests (goals and tasks), chat messages, and API contracts.
 * These types ensure type safety across the entire application and serve as the
 * contract between the frontend and backend systems.
 */

/**
 * User preferences configuration
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    dailyReminders: boolean;
    weeklyDigest: boolean;
  };
  timezone: string;
  language: string;
  questCategories: string[];
  privacySettings: {
    shareProgress: boolean;
    publicProfile: boolean;
  };
}

/**
 * User profile information from the Users table
 */
export interface UserProfile {
  userId: string;
  username: string; // Unique username across the platform
  email: string; // Unique email across the platform
  firstName: string;
  lastName: string;
  displayName?: string;
  avatarUrl?: string;
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt?: string;
  updatedAt: string;
}

/**
 * Profile creation request structure
 */
export interface CreateProfileRequest {
  username: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  preferences?: Partial<UserPreferences>;
}

/**
 * Profile update request structure
 */
export interface UpdateProfileRequest {
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  preferences?: Partial<UserPreferences>;
}

/**
 * Epic Quest (long-term goal) data structure
 */
export interface Goal {
  userId: string;
  goalId: string;
  goalName: string;
  description?: string;
  targetDate?: string;
  category?: string;
  status: 'active' | 'completed' | 'paused';
  roadmapStatus: 'none' | 'generating' | 'ready'; // New field for roadmap status
  createdAt: string;
  updatedAt: string;
}

/**
 * Milestone data structure - represents high-level steps in an Epic Quest's roadmap
 */
export interface Milestone {
  epicId: string; // The goalId of the parent Epic Quest (Partition Key)
  sequence: number; // Order in the roadmap (Sort Key)
  milestoneId: string; // Unique ID for the milestone
  userId: string; // The ID of the user who owns it
  title: string; // e.g., "Week 1: Master Basic Chords"
  description?: string; // e.g., "Focus on G, C, and D chords and smooth transitions"
  status: 'locked' | 'active' | 'completed'; // Progress tracking
  durationInDays: number; // Estimated duration for this milestone
  createdAt: string;
  updatedAt: string;
}

/**
 * Daily Quest (task) data structure
 */
export interface Task {
  userId: string;
  taskId: string;
  taskName: string;
  description?: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  goalId?: string;
  milestoneId?: string; // New field linking task to milestone
  createdAt: string;
  updatedAt: string;
}

/**
 * Chat message in conversation history
 * Note: TTL field is added at runtime for DynamoDB automatic cleanup
 */
export interface ChatMessage {
  userId: string;
  timestamp: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Recurrence rule for automatically generating daily quests
 */
export interface RecurrenceRule {
  userId: string;
  recurrenceRuleId: string;
  goalId?: string; // Optional linked goal ID
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status: 'active' | 'paused';
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly';
  daysOfWeek?: number[]; // For 'weekly' frequency (0=Sun, 1=Mon, ..., 6=Sat)
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregated context data for AI prompt construction
 */
export interface ContextData {
  userProfile: UserProfile | null;
  activeGoals: Goal[];
  todayTasks: Task[];
  chatHistory: ChatMessage[];
}

/**
 * Tool input parameters for AI quest management operations
 * Updated to support both get_quests (read) and modify_quest (write) operations
 */
export interface ToolInput {
  // Common fields
  questType?: 'epic' | 'daily' | 'recurrence';
  questId?: string;
  epicId?: string;

  // Fields for modify_quest tool
  operation?: 'create' | 'update' | 'delete';
  title?: string;
  dueDate?: string;
  recurrenceRule?: string;
  frequency?: 'daily' | 'weekdays' | 'weekends' | 'weekly';
  daysOfWeek?: number[];
  updateFields?: { [key: string]: any };

  // Fields for get_quests tool
  status?: 'pending' | 'in-progress' | 'completed' | 'active' | 'paused';
}

/**
 * Response from Amazon Bedrock AI service
 */
export interface BedrockResponse {
  response: string;
  toolCalls?: {
    tool: string;
    input: ToolInput;
  }[];
}

/**
 * Validated chat request after authentication
 */
export interface ChatRequest {
  userId: string;
  userMessage: string;
}

/**
 * Standardized chat response format
 */
export interface ChatResponse {
  response: string;
  timestamp: string;
  requestId: string;
}
