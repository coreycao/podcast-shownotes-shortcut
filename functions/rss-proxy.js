import { handleProxyRequest } from '../cors-proxy/src/proxy.js';

export function onRequest(context) {
  return handleProxyRequest(context.request, context.env);
}
