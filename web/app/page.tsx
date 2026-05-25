// Proxy handles the redirect from "/" — this file exists so Next renders
// something if the proxy is bypassed (e.g. while it's compiling on first hit).
export default function Index() {
  return null;
}
