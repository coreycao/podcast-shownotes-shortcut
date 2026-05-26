import { handleProxyRequest } from './proxy.js';

export default {
  async fetch(request, env) {
    return handleProxyRequest(request, env);
  },
};
