export function usesAddressOnlyProxy(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.port === "8787" && url.pathname.replace(/\/+$/, "") === "/v1" &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
