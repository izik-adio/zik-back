/**
 * Recurring Task Generator Lambda
 *
 * This Lambda function is triggered daily by EventBridge to automatically
 * generate daily quests based on active recurrence rules.
 */
import { Handler } from 'aws-lambda';
import { fetchActiveRecurrenceRules } from '../services/database/recurrenceRules';
import { createTask } from '../services/database/tasks';
import { RecurrenceRule } from '../types';
import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

/**
 * Checks if a task should be created today based on a recurrence rule.
 * @param rule The recurrence rule to check.
 * @param today The current date object.
 * @returns boolean
 */
const shouldCreateTaskToday = (rule: RecurrenceRule, today: Date): boolean => {
  if (rule.status !== 'active') {
    return false;
  }

  const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  switch (rule.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly':
      return rule.daysOfWeek?.includes(dayOfWeek) ?? false;
    default:
      return false;
  }
};

/**
 * Lambda handler for generating recurring tasks.
 */
export const handler: Handler = async (event, context) => {
  Logger.info('Starting recurring task generation job', {
    requestId: context.awsRequestId,
  });

  const today = new Date();
  const todayDateString = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  try {
    // 1. Fetch all active recurrence rules
    const rules = await fetchActiveRecurrenceRules();

    if (!rules || rules.length === 0) {
      Logger.info('No active recurrence rules found. Exiting job.');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Job completed successfully',
          tasksCreated: 0,
          reason: 'No active recurrence rules found',
        }),
      };
    }

    Logger.info(`Found ${rules.length} active recurrence rules to process.`);
    let tasksCreated = 0;
    const errors: string[] = [];

    // 2. Process each rule
    for (const rule of rules) {
      try {
        if (shouldCreateTaskToday(rule, today)) {
          // 3. Create the new daily task using existing createTask function
          const successMessage = await createTask(
            rule.userId,
            rule.title,
            todayDateString,
            rule.goalId, // This might be undefined, which is fine
            rule.description // Pass description from recurrence rule
          );

          tasksCreated++;
          Logger.info(`Created recurring task for user`, {
            userId: rule.userId,
            ruleId: rule.recurrenceRuleId,
            title: rule.title,
            dueDate: todayDateString,
          });
        } else {
          Logger.debug(`Skipping rule - not scheduled for today`, {
            userId: rule.userId,
            ruleId: rule.recurrenceRuleId,
            frequency: rule.frequency,
            dayOfWeek: today.getUTCDay(),
          });
        }
      } catch (error) {
        const errorMessage = `Failed to create task for rule ${
          rule.recurrenceRuleId
        }: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        Logger.error('Error creating recurring task', error, {
          userId: rule.userId,
          ruleId: rule.recurrenceRuleId,
          title: rule.title,
        });
      }
    }

    const resultMessage = `Job completed. Successfully created ${tasksCreated} new daily quests.`;
    Logger.info(resultMessage, {
      tasksCreated,
      totalRulesProcessed: rules.length,
      errors: errors.length,
    });

    if (errors.length > 0) {
      Logger.warn('Some tasks failed to create', { errors });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: resultMessage,
        tasksCreated,
        totalRulesProcessed: rules.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
    };
  } catch (error) {
    const errorMessage = 'Critical error during recurring task generation';
    Logger.error(errorMessage, error, {
      requestId: context.awsRequestId,
      date: todayDateString,
    });

    // Re-throw to trigger Lambda retries
    throw new DatabaseError(errorMessage, error);
  }
};
