#!/bin/bash

# Setup Environment Variables for CDK Deployment
# This script helps you set the required environment variables for deployment

echo "🎯 Zik Backend - Environment Setup"
echo "=================================="

# Check if AWS CLI is configured
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Get current AWS account and region
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

if [ -z "$AWS_ACCOUNT" ]; then
    echo "❌ Unable to get AWS account. Make sure AWS CLI is configured."
    echo "   Run: aws configure"
    exit 1
fi

echo "✅ AWS Account: $AWS_ACCOUNT"
echo "✅ AWS Region: $AWS_REGION"
echo ""

# Set environment variables for CDK
export CDK_DEFAULT_ACCOUNT="$AWS_ACCOUNT"
export CDK_DEFAULT_REGION="$AWS_REGION"

echo "🚀 Environment variables set:"
echo "   CDK_DEFAULT_ACCOUNT=$CDK_DEFAULT_ACCOUNT"
echo "   CDK_DEFAULT_REGION=$CDK_DEFAULT_REGION"
echo ""

# Update .env file if it exists
if [ -f ".env" ]; then
    echo "📝 Updating .env file with CDK variables..."
    
    # Create backup
    cp .env .env.backup
    
    # Update or add CDK variables
    if grep -q "CDK_DEFAULT_ACCOUNT=" .env; then
        sed -i "s/CDK_DEFAULT_ACCOUNT=.*/CDK_DEFAULT_ACCOUNT=$CDK_DEFAULT_ACCOUNT/" .env
    else
        echo "CDK_DEFAULT_ACCOUNT=$CDK_DEFAULT_ACCOUNT" >> .env
    fi
    
    if grep -q "CDK_DEFAULT_REGION=" .env; then
        sed -i "s/CDK_DEFAULT_REGION=.*/CDK_DEFAULT_REGION=$CDK_DEFAULT_REGION/" .env
    else
        echo "CDK_DEFAULT_REGION=$CDK_DEFAULT_REGION" >> .env
    fi
    
    echo "✅ .env file updated (backup saved as .env.backup)"
else
    echo "ℹ️  No .env file found. Copy .env.example to .env and update it with your values."
fi

echo ""
echo "🎉 Ready for deployment! Run:"
echo "   npm run build"
echo "   cdk deploy"
