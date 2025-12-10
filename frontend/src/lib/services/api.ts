import { supabase } from '$lib/supabaseClient';

const API_URL = 'http://localhost:8000';

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  // Get JWT token from Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  
  return headers;
}

export async function get(path: string) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/${path}`, { headers });
  
  if (!response.ok) {
    // Try to extract error message from response
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return await response.json();
}

export async function post(path: string, data: any) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    // Try to extract error message from response
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return await response.json();
}

export async function put(path: string, data: any) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }
  
  return await response.json();
}

export async function del(path: string) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/${path}`, {
    method: 'DELETE',
    headers,
  });
  
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }
  
  return await response.json();
}


