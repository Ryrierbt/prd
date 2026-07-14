const defaultUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) AppResearchBot/0.1";

export async function fetchText(
  url: string,
  options: {
    timeoutMs?: number;
    retries?: number;
    headers?: Record<string, string>;
  } = {}
) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const retries = options.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": defaultUserAgent,
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(600 * (attempt + 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("请求失败");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

