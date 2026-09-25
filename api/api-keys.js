const crypto = require("crypto");

function generateApiKey(environment = "live") {
  const prefix =
    environment === "test"
      ? "pk_test_"
      : "pk_live_";

  const secret = crypto
    .randomBytes(32)
    .toString("hex");

  const apiKey = `${prefix}${secret}`;

  const keyHash = crypto
    .createHash("sha256")
    .update(apiKey)
    .digest("hex");

  return {
    apiKey,
    keyPrefix: apiKey.slice(0, 16),
    keyHash
  };
}

function hashApiKey(apiKey) {
  return crypto
    .createHash("sha256")
    .update(apiKey)
    .digest("hex");
}

function createApiKeyStore(db) {
  function createProject(name) {
    if (!name || typeof name !== "string") {
      throw new Error("Project name is required");
    }

    const projectId =
      `proj_${crypto.randomUUID()}`;

    const project = {
      id: projectId,
      name: name.trim(),
      created_at: new Date().toISOString()
    };

    db.withData((data) => {
      data.projects.push(project);
    });

    return {
      id: project.id,
      name: project.name
    };
  }

  function createKey({
    projectId,
    name = "Default",
    environment = "live"
  }) {
    if (!projectId) {
      throw new Error("projectId is required");
    }

    const generated =
      generateApiKey(environment);

    const keyId =
      `key_${crypto.randomUUID()}`;

    const createdAt =
      new Date().toISOString();

    let projectExists = false;

    db.withData((data) => {
      projectExists = data.projects.some(
        (project) =>
          project.id === projectId
      );

      if (!projectExists) {
        return;
      }

      data.apiKeys.push({
        id: keyId,
        project_id: projectId,
        name,
        key_prefix: generated.keyPrefix,
        key_hash: generated.keyHash,
        environment,
        created_at: createdAt,
        last_used_at: null,
        revoked_at: null
      });
    });

    if (!projectExists) {
      throw new Error(
        "Project not found"
      );
    }

    return {
      id: keyId,
      projectId,
      name,
      environment,
      apiKey: generated.apiKey,
      keyPrefix: generated.keyPrefix
    };
  }

  function authenticate(apiKey) {
    if (!apiKey) {
      return null;
    }

    const keyHash =
      hashApiKey(apiKey);

    const data = db.load();

    const record =
      data.apiKeys.find(
        (key) =>
          key.key_hash === keyHash
      );

    if (!record) {
      return null;
    }

    if (record.revoked_at) {
      return null;
    }

    const now =
      new Date().toISOString();

    db.withData((current) => {
      const key =
        current.apiKeys.find(
          (item) =>
            item.id === record.id
        );

      if (key) {
        key.last_used_at = now;
      }
    });

    return {
      id: record.id,
      projectId: record.project_id,
      name: record.name,
      environment: record.environment,
      keyPrefix: record.key_prefix
    };
  }

  function revoke(id) {
    let revoked = false;

    db.withData((data) => {
      const record =
        data.apiKeys.find(
          (key) => key.id === id
        );

      if (!record || record.revoked_at) {
        return;
      }

      record.revoked_at =
        new Date().toISOString();

      revoked = true;
    });

    return revoked;
  }

  function list(projectId) {
    const data = db.load();

    return data.apiKeys
      .filter(
        (key) =>
          key.project_id === projectId
      )
      .sort(
        (a, b) =>
          new Date(b.created_at) -
          new Date(a.created_at)
      )
      .map((key) => ({
        id: key.id,
        project_id: key.project_id,
        name: key.name,
        key_prefix: key.key_prefix,
        environment: key.environment,
        created_at: key.created_at,
        last_used_at: key.last_used_at,
        revoked_at: key.revoked_at
      }));
  }

  return {
    createProject,
    createKey,
    authenticate,
    revoke,
    list
  };
}

module.exports = {
  createApiKeyStore
};
