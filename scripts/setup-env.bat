@echo off
:: Setup Environment Variables for CDK Deployment (Windows)
:: This script helps you set the required environment variables for deployment

echo 🎯 Zik Backend - Environment Setup
echo ==================================

:: Check if AWS CLI is available
where aws >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ AWS CLI is not installed. Please install it first.
    exit /b 1
)

:: Get current AWS account and region
for /f "tokens=*" %%i in ('aws sts get-caller-identity --query Account --output text 2^>nul') do set AWS_ACCOUNT=%%i
for /f "tokens=*" %%i in ('aws configure get region 2^>nul') do set AWS_REGION=%%i

if "%AWS_REGION%"=="" set AWS_REGION=us-east-1

if "%AWS_ACCOUNT%"=="" (
    echo ❌ Unable to get AWS account. Make sure AWS CLI is configured.
    echo    Run: aws configure
    exit /b 1
)

echo ✅ AWS Account: %AWS_ACCOUNT%
echo ✅ AWS Region: %AWS_REGION%
echo.

:: Set environment variables for CDK
set CDK_DEFAULT_ACCOUNT=%AWS_ACCOUNT%
set CDK_DEFAULT_REGION=%AWS_REGION%

echo 🚀 Environment variables set:
echo    CDK_DEFAULT_ACCOUNT=%CDK_DEFAULT_ACCOUNT%
echo    CDK_DEFAULT_REGION=%CDK_DEFAULT_REGION%
echo.

:: Update .env file if it exists
if exist ".env" (
    echo 📝 Updating .env file with CDK variables...
    
    :: Create backup
    copy .env .env.backup >nul
    
    :: Simple replacement (Windows batch is limited, so we'll append if not found)
    findstr /v "CDK_DEFAULT_ACCOUNT=" .env > .env.temp
    findstr /v "CDK_DEFAULT_REGION=" .env.temp > .env.temp2
    echo CDK_DEFAULT_ACCOUNT=%CDK_DEFAULT_ACCOUNT%>> .env.temp2
    echo CDK_DEFAULT_REGION=%CDK_DEFAULT_REGION%>> .env.temp2
    move .env.temp2 .env >nul
    del .env.temp >nul 2>nul
    
    echo ✅ .env file updated (backup saved as .env.backup)
) else (
    echo ℹ️  No .env file found. Copy .env.example to .env and update it with your values.
)

echo.
echo 🎉 Ready for deployment! Run:
echo    npm run build
echo    cdk deploy

pause
