export function normalized(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

export function roleAliases(role) {
  const aliases = {
    asr: ["asr", "speechrecognition", "qwen-asr", "qwen3-asr"],
    llm: ["llm", "chatmodel", "llama", "llama-cpp", "llama.cpp"],
    tts: ["tts", "voice", "cosyvoice"],
    backend: ["backend", "fastapi", "branchwhisperbackend"],
    websocket: ["websocket", "ws", "socket"],
    integration: ["wechat", "weixin", "wx", "bridge", "integration"],
  };
  return aliases[role] || [normalized(role)];
}

export function serviceRoleText(service) {
  return normalized(
    [
      service?.id,
      service?.role,
      service?.provider,
      service?.label,
      service?.description,
      service?.health_url,
    ].join(" "),
  );
}

export function diagnosticRoleText(item) {
  return normalized([item?.role, item?.name, item?.provider].join(" "));
}

export function findDiagnosticItemForRole(role, items) {
  const normalizedRole = normalized(role);
  const direct = items.find((item) => normalized(item?.role) === normalizedRole);
  if (direct) return direct;

  const aliases = roleAliases(role);
  return items.find((item) => {
    const text = diagnosticRoleText(item);
    return aliases.some((alias) => text.includes(normalized(alias)));
  }) || null;
}

export function findServiceForDiagnosticRole(role, item, services) {
  const direct = services.find((service) => normalized(service?.id) === normalized(role));
  if (direct) return direct;

  const aliases = roleAliases(role);
  const itemText = diagnosticRoleText(item);
  return services.find((service) => {
    const text = serviceRoleText(service);
    return aliases.some((alias) => {
      const normalizedAlias = normalized(alias);
      return text.includes(normalizedAlias) && (!itemText || itemText.includes(normalizedAlias));
    });
  }) || null;
}
