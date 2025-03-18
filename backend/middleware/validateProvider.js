/**
 * Middleware to validate email provider
 * Ensures the requested provider is supported and valid
 */

const validateProvider = (requiredProvider) => {
  return (req, res, next) => {
    // List of supported providers
    const validProviders = ['gmail', 'outlook', 'hubspot'];
    
    // If a specific provider is required, check that it matches
    if (requiredProvider) {
      if (!validProviders.includes(requiredProvider)) {
        return res.status(400).json({
          success: false,
          error: `Provider '${requiredProvider}' is not supported`
        });
      }
      
      // For routes that require a specific provider, we don't need to check the request
      return next();
    }
    
    // Get provider from request params or query
    const provider = req.params.provider || req.query.provider;
    
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: 'Email provider is required'
      });
    }
    
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Provider '${provider}' is not supported`
      });
    }
    
    next();
  };
};

module.exports = { validateProvider };
