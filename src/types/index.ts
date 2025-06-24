/**
 * Shared TypeScript interfaces and types for the Zik application
 *
 * This file contains all the core data structures used throughout the Zik backend,
 * including user profiles, quests (goals and tasks), chat messages, and API contracts.
 * These types ensure type safety across the entire application and serve as the
 * contract between the frontend and backend systems.
 */

/**
 * User profile information from the Users table
 */
export interface UserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferences: any;
  createdAt: string;
  lastLoginAt?: string;
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Chat message in conversation history
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
