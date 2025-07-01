/**
 * Cognito Custom Message Lambda Trigger
 *
 * This Lambda function customizes email content based on the trigger source.
 * It provides different email templates for:
 * - User verification (signup)
 * - Password reset (forgot password)
 * - User invitation (admin created users)
 */

import { CustomMessageTriggerEvent, Context } from 'aws-lambda';
import { Logger } from '../src/utils/logger';

export async function handler(
  event: CustomMessageTriggerEvent,
  context: Context
): Promise<CustomMessageTriggerEvent> {
  try {
    Logger.info('Custom message trigger invoked', {
      triggerSource: event.triggerSource,
      userPoolId: event.userPoolId,
      userName: event.userName,
      requestId: context.awsRequestId,
    });

    // Get the trigger source to determine which email template to use
    const triggerSource = event.triggerSource;

    switch (triggerSource) {
      case 'CustomMessage_SignUp':
      case 'CustomMessage_ResendCode':
        // Email verification during signup
        event.response.emailSubject =
          'Welcome to Zik! Verify your email address';
        event.response.emailMessage = getSignupVerificationTemplate(
          event.request.codeParameter
        );
        break;

      case 'CustomMessage_ForgotPassword':
        // Password reset email
        event.response.emailSubject = 'Reset your Zik password';
        event.response.emailMessage = getPasswordResetTemplate(
          event.request.codeParameter
        );
        break;

      case 'CustomMessage_AdminCreateUser':
        // Admin-created user invitation
        event.response.emailSubject = "You're invited to join Zik!";
        event.response.emailMessage = getUserInvitationTemplate(
          event.request.codeParameter,
          event.userName
        );
        break;

      default:
        Logger.warn('Unknown trigger source, using default template', {
          triggerSource,
          requestId: context.awsRequestId,
        });
        // Keep the default Cognito template
        break;
    }

    Logger.info('Custom message template applied successfully', {
      triggerSource: event.triggerSource,
      requestId: context.awsRequestId,
    });

    return event;
  } catch (error) {
    Logger.error('Error in custom message trigger', error, {
      triggerSource: event.triggerSource,
      requestId: context.awsRequestId,
    });

    // Return the event unchanged in case of error to avoid breaking auth flow
    return event;
  }
}

/**
 * Email template for signup verification
 */
function getSignupVerificationTemplate(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Welcome to Zik! 🎯</h1>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Hi there! 👋
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Thanks for signing up for Zik! We're excited to help you achieve your goals and organize your tasks.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            To complete your account setup, please verify your email address by entering this verification code:
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 20px; display: inline-block;">
            <span style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 4px; font-family: 'Courier New', monospace;">
              ${code}
            </span>
          </div>
        </div>

        <div style="margin: 30px 0;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Once verified, you'll be able to:
          </p>
          <ul style="color: #555; font-size: 16px; line-height: 1.6; margin: 0; padding-left: 20px;">
            <li>Create and manage your goals</li>
            <li>Break down goals into actionable tasks</li>
            <li>Track your progress with AI assistance</li>
            <li>Get personalized recommendations</li>
          </ul>
        </div>

        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
          <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 0;">
            If you didn't create an account with Zik, you can safely ignore this email.
          </p>
          <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 10px 0 0 0;">
            This verification code will expire in 24 hours.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Email template for password reset
 */
function getPasswordResetTemplate(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Reset Your Password 🔒</h1>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Hi there! 👋
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            We received a request to reset your password for your Zik account.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Please use the following verification code to reset your password:
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f8f9fa; border: 2px dashed #dc3545; border-radius: 8px; padding: 20px; display: inline-block;">
            <span style="font-size: 32px; font-weight: bold; color: #dc3545; letter-spacing: 4px; font-family: 'Courier New', monospace;">
              ${code}
            </span>
          </div>
        </div>

        <div style="margin: 30px 0;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            For your security, this verification code will expire in 1 hour.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>

        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
          <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 0;">
            If you're having trouble accessing your account, please contact our support team.
          </p>
          <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 10px 0 0 0;">
            This is an automated message from Zik. Please do not reply to this email.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Email template for user invitation (admin-created users)
 */
function getUserInvitationTemplate(
  temporaryPassword: string,
  username: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 28px;">Welcome to Zik! 🎯</h1>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Hello ${username}! 👋
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            You've been invited to join Zik, your personal goal achievement and task management platform.
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Your temporary password is:
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f8f9fa; border: 2px solid #28a745; border-radius: 8px; padding: 20px; display: inline-block;">
            <span style="font-size: 18px; font-weight: bold; color: #28a745; font-family: 'Courier New', monospace;">
              ${temporaryPassword}
            </span>
          </div>
        </div>

        <div style="margin: 30px 0;">
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
            Please log in and change your password on your first visit. With Zik, you'll be able to:
          </p>
          <ul style="color: #555; font-size: 16px; line-height: 1.6; margin: 0; padding-left: 20px;">
            <li>Set and track meaningful goals</li>
            <li>Break down complex objectives into manageable tasks</li>
            <li>Get AI-powered insights and recommendations</li>
            <li>Monitor your progress and celebrate achievements</li>
          </ul>
        </div>

        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
          <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 0;">
            This is a secure invitation. If you believe you received this email in error, please contact support.
          </p>
        </div>
      </div>
    </div>
  `;
}
