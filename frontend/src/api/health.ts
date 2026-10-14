export interface HealthResponse {
  status: "ok";
  service: "uno-no-mercy-api";
}

const DEFAULT_API_URL = "http://localhost:3000";

export async function getHealth(
  apiBaseUrl = import.meta.env.VITE_API_URL || DEFAULT_API_URL,
): Promise<HealthResponse> {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${normalizedBaseUrl}/api/health`);

  if (!response.ok) {
    throw new Error("Backend health check failed");
  }

  return response.json() as Promise<HealthResponse>;
}
