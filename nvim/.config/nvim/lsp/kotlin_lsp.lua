return {
  cmd = { "intellij-server", "--stdio" },
  filetypes = { "kotlin" },
  -- Earlier entries win: the Gradle settings file roots the project, so a
  -- module's nearer build.gradle.kts (app/) does not become a root of its own.
  root_markers = {
    { "settings.gradle.kts", "settings.gradle" },
    { "build.gradle.kts", "build.gradle", "pom.xml", "workspace.json" },
  },
}
