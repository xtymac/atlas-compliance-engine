const { v4: uuid } = require("uuid");

const clients = new Map();
clients.set("ace-prototype-client", {
  clientSecret: "ace-prototype-secret",
  scopes: ["datasets:write", "datasets:read", "items:write", "assets:write"],
});

const tokens = new Map();
const TOKEN_TTL_MS = 60 * 60 * 1000;

function issueToken(req, res) {
  const { clientId, clientSecret, scope = "" } = req.body || {};
  const client = clients.get(clientId);

  if (!client || client.clientSecret !== clientSecret) {
    return res.status(401).json({ error: "invalid_client" });
  }

  const token = uuid();
  const now = Date.now();
  const scopes = scope ? scope.split(" ") : client.scopes;

  tokens.set(token, {
    clientId,
    scope: scopes,
    createdAt: now,
  });

  return res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_MS / 1000,
    scope: scopes.join(" "),
  });
}

function ensureAuthenticated(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const tokenData = tokens.get(token);
  if (Date.now() - tokenData.createdAt > TOKEN_TTL_MS) {
    tokens.delete(token);
    return res.status(401).json({ error: "token_expired" });
  }

  req.auth = tokenData;
  next();
}

module.exports = {
  issueToken,
  ensureAuthenticated,
};
