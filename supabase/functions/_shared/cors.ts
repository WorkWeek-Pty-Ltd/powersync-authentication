// allow requests from any origin
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.workweek.africa',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, x-client-info, apikey, Content-Type',
};

// Allowed origins
const allowedOrigins = [
  'https://app.workweek.africa',
  'https://workweek.flutterflow.app',
];

// Function to set CORS headers dynamically based on origin
export const getCorsHeaders = (origin: string) => {
  if (allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, x-client-info, apikey, Content-Type',
    };
  } else {
    // If the origin is not allowed, you can choose to return a set of headers
    // that effectively deny the CORS request, or omit the ACAO header entirely.
    return {
      'Access-Control-Allow-Origin': allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, x-client-info, apikey, Content-Type',
    };
  }
};
