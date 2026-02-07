export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

const BASE_URL = '/api';

interface RequestOptions extends RequestInit {
  body?: any;
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  
  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer dummy');
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) 
      ? JSON.stringify(options.body) 
      : options.body,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || JSON.stringify(errorData) || errorMessage;
      } catch (e) {
        // ignore json parse error
      }
      throw new ApiError(errorMessage, response.status);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error) {
    console.error('API Request Failed:', error);
    throw error;
  }
}
