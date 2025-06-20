// Validation utility functions for API data

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const VALID_PRIORITIES = ['low', 'medium', 'high'];
export const VALID_TASK_STATUSES = ['pending', 'in-progress', 'completed'];
export const VALID_GOAL_STATUSES = ['active', 'completed', 'paused'];

export const MAX_STRING_LENGTH = 1000;
export const MAX_TASK_NAME_LENGTH = 200;
export const MAX_GOAL_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000; // Increased for large descriptions
export const MAX_PAYLOAD_SIZE = 10000; // 10KB payload limit

export function validateTaskData(
  data: any,
  requireUserId: boolean = true
): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (requireUserId && (!data.userId || typeof data.userId !== 'string')) {
    errors.push('userId is required and must be a string');
  }

  if (!data.taskName || typeof data.taskName !== 'string') {
    errors.push('taskName is required and must be a string');
  } else if (data.taskName.length > MAX_TASK_NAME_LENGTH) {
    errors.push(`taskName must be ${MAX_TASK_NAME_LENGTH} characters or less`);
  } else if (data.taskName.trim().length === 0) {
    errors.push('taskName cannot be empty');
  }

  if (!data.dueDate || typeof data.dueDate !== 'string') {
    errors.push('dueDate is required and must be a string');
  } else if (!isValidDateFormat(data.dueDate)) {
    errors.push('dueDate must be in YYYY-MM-DD format');
  }

  // Check optional fields if provided
  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }
  }
  if (data.priority !== undefined) {
    if (
      typeof data.priority !== 'string' ||
      !VALID_PRIORITIES.includes(data.priority.toLowerCase())
    ) {
      errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
  }

  if (data.status !== undefined) {
    if (
      typeof data.status !== 'string' ||
      !VALID_TASK_STATUSES.includes(data.status.toLowerCase())
    ) {
      errors.push(`status must be one of: ${VALID_TASK_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateGoalData(
  data: any,
  requireUserId: boolean = true
): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (requireUserId && (!data.userId || typeof data.userId !== 'string')) {
    errors.push('userId is required and must be a string');
  }

  if (!data.goalName || typeof data.goalName !== 'string') {
    errors.push('goalName is required and must be a string');
  } else if (data.goalName.length > MAX_GOAL_NAME_LENGTH) {
    errors.push(`goalName must be ${MAX_GOAL_NAME_LENGTH} characters or less`);
  } else if (data.goalName.trim().length === 0) {
    errors.push('goalName cannot be empty');
  }

  if (!data.targetDate || typeof data.targetDate !== 'string') {
    errors.push('targetDate is required and must be a string');
  } else if (!isValidDateFormat(data.targetDate)) {
    errors.push('targetDate must be in YYYY-MM-DD format');
  } else if (new Date(data.targetDate) <= new Date()) {
    errors.push('targetDate must be in the future');
  }

  // Check optional fields if provided
  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }
  }

  if (data.category !== undefined && typeof data.category !== 'string') {
    errors.push('category must be a string');
  }
  if (data.status !== undefined) {
    if (
      typeof data.status !== 'string' ||
      !VALID_GOAL_STATUSES.includes(data.status.toLowerCase())
    ) {
      errors.push(`status must be one of: ${VALID_GOAL_STATUSES.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateTaskUpdateData(data: any): ValidationResult {
  const errors: string[] = [];

  // For updates, fields are optional but must be valid if provided
  if (data.taskName !== undefined) {
    if (typeof data.taskName !== 'string') {
      errors.push('taskName must be a string');
    } else if (data.taskName.length > MAX_TASK_NAME_LENGTH) {
      errors.push(
        `taskName must be ${MAX_TASK_NAME_LENGTH} characters or less`
      );
    } else if (data.taskName.trim().length === 0) {
      errors.push('taskName cannot be empty');
    }
  }

  if (data.dueDate !== undefined) {
    if (typeof data.dueDate !== 'string') {
      errors.push('dueDate must be a string');
    } else if (!isValidDateFormat(data.dueDate)) {
      errors.push('dueDate must be in YYYY-MM-DD format');
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }
  }
  if (
    data.priority !== undefined &&
    !VALID_PRIORITIES.includes(data.priority.toLowerCase())
  ) {
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (
    data.status !== undefined &&
    !VALID_TASK_STATUSES.includes(data.status.toLowerCase())
  ) {
    errors.push(`status must be one of: ${VALID_TASK_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateGoalUpdateData(data: any): ValidationResult {
  const errors: string[] = [];

  // For updates, fields are optional but must be valid if provided
  if (data.goalName !== undefined) {
    if (typeof data.goalName !== 'string') {
      errors.push('goalName must be a string');
    } else if (data.goalName.length > MAX_GOAL_NAME_LENGTH) {
      errors.push(
        `goalName must be ${MAX_GOAL_NAME_LENGTH} characters or less`
      );
    } else if (data.goalName.trim().length === 0) {
      errors.push('goalName cannot be empty');
    }
  }

  if (data.targetDate !== undefined) {
    if (typeof data.targetDate !== 'string') {
      errors.push('targetDate must be a string');
    } else if (!isValidDateFormat(data.targetDate)) {
      errors.push('targetDate must be in YYYY-MM-DD format');
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push('description must be a string');
    } else if (data.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }
  }

  if (data.category !== undefined && typeof data.category !== 'string') {
    errors.push('category must be a string');
  }
  if (
    data.status !== undefined &&
    !VALID_GOAL_STATUSES.includes(data.status.toLowerCase())
  ) {
    errors.push(`status must be one of: ${VALID_GOAL_STATUSES.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function isValidDateFormat(dateString: string): boolean {
  // Check YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  // Check if it's a valid date
  const date = new Date(dateString);
  const dateParts = dateString.split('-');
  return (
    date.getFullYear() === parseInt(dateParts[0]) &&
    date.getMonth() + 1 === parseInt(dateParts[1]) &&
    date.getDate() === parseInt(dateParts[2])
  );
}
