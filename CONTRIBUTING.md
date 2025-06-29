# Contributing to Zik Backend

Thank you for considering contributing to the Zik Backend project! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues

1. **Check existing issues** to avoid duplicates
2. **Use issue templates** when available
3. **Provide detailed information**:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, AWS region, etc.)
   - Error messages and logs

### Suggesting Features

1. **Open a discussion** first for major features
2. **Explain the use case** and business value
3. **Consider implementation complexity**
4. **Provide mockups or examples** when helpful

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** from `main`
3. **Make your changes** following our coding standards
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Ensure all tests pass**
7. **Submit a pull request**

## 🏗️ Development Setup

### Prerequisites

- Node.js 18+ 
- AWS CLI configured
- AWS CDK installed globally
- Git

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/zik-backend.git
cd zik-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Build the project
npm run build

# Run tests
npm test
```

## 📝 Coding Standards

### TypeScript Guidelines

- **Strict TypeScript**: Enable all strict mode flags
- **Explicit Types**: Prefer explicit typing over `any`
- **Interface over Type**: Use interfaces for object shapes
- **Async/Await**: Prefer over Promise chains
- **Error Handling**: Always handle errors appropriately

### Code Organization

```typescript
// Good: Explicit return type and error handling
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await dynamoClient.get({
      TableName: PROFILE_TABLE,
      Key: { userId }
    }).promise();
    
    return result.Item as UserProfile || null;
  } catch (error) {
    Logger.error('Failed to get user profile', error, { userId });
    throw new Error('Database operation failed');
  }
}

// Bad: Implicit types and no error handling
async function getUserProfile(userId) {
  const result = await dynamoClient.get({
    TableName: PROFILE_TABLE,
    Key: { userId }
  }).promise();
  return result.Item;
}
```

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Functions**: camelCase (`getUserProfile`)
- **Constants**: UPPER_SNAKE_CASE (`API_ENDPOINT`)
- **Interfaces**: PascalCase with descriptive names (`UserProfile`)

### Testing Standards

- **Test Coverage**: Minimum 80% coverage for new code
- **Test Structure**: Use Arrange-Act-Assert pattern
- **Mock External Services**: Don't call real AWS services in tests
- **Test Names**: Descriptive and behavior-focused

```typescript
// Good test structure
describe('UserService', () => {
  describe('getUserProfile', () => {
    it('should return user profile when user exists', async () => {
      // Arrange
      const userId = 'test-user-id';
      const expectedProfile = { userId, name: 'Test User' };
      mockDynamoClient.get.mockResolvedValue({ Item: expectedProfile });

      // Act
      const result = await userService.getUserProfile(userId);

      // Assert
      expect(result).toEqual(expectedProfile);
      expect(mockDynamoClient.get).toHaveBeenCalledWith({
        TableName: PROFILE_TABLE,
        Key: { userId }
      });
    });
  });
});
```

## 🚀 Infrastructure Guidelines

### CDK Best Practices

- **Resource Naming**: Use consistent, descriptive names
- **Environment Variables**: Parameterize configuration
- **Security**: Apply least privilege principles
- **Monitoring**: Include CloudWatch metrics and alarms

### Lambda Functions

- **Single Responsibility**: One function per endpoint/operation
- **Error Handling**: Implement proper error responses
- **Logging**: Use structured logging with context
- **Performance**: Optimize cold start times

## 📚 Documentation

### Code Documentation

- **JSDoc Comments**: Document public functions and classes
- **README Updates**: Keep README.md current with changes
- **API Documentation**: Update endpoint documentation
- **Architecture Decisions**: Document significant choices

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Build/dependency updates

Examples:
```
feat(auth): add JWT token validation
fix(chat): resolve conversation context bug
docs(api): update endpoint documentation
```

## 🔍 Review Process

### Pull Request Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No breaking changes (or clearly documented)
- [ ] Security considerations addressed
- [ ] Performance impact considered

### Review Criteria

1. **Functionality**: Does it work as intended?
2. **Code Quality**: Is it maintainable and readable?
3. **Testing**: Are there adequate tests?
4. **Security**: Are there any security concerns?
5. **Performance**: Will it impact system performance?
6. **Documentation**: Is it properly documented?

## 🆘 Getting Help

- **Discussions**: Use GitHub Discussions for questions
- **Issues**: Report bugs via GitHub Issues
- **Documentation**: Check DOCUMENTATION.md for technical details
- **Code Examples**: Look at existing code for patterns

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Zik Backend! 🎉
