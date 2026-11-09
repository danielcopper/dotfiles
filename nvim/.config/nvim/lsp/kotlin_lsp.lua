return {
  cmd = { "intellij-server", "--stdio" },
  filetypes = { "kotlin" },
  -- Nested lists rank the markers: the Gradle settings file wins over the
  -- nearer build file, so a module's build.gradle.kts (app/) does not become
  -- a root of its own.
  root_markers = {
    { "settings.gradle.kts", "settings.gradle" },
    { "build.gradle.kts", "build.gradle", "pom.xml", "workspace.json" },
  },
}
