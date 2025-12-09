const API_URL = 'http://localhost:8000';

export async function get(path: string) {
  const response = await fetch(`${API_URL}/${path}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export async function post(path: string, data: any) {
  const response = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}
