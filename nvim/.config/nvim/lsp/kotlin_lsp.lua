-- The Gradle import ignores JAVA_HOME and runs on the newest JDK it finds;
-- when that is not the JDK the project builds with, it starts a second
-- Gradle daemon. Point it at JAVA_HOME when that is set, and say so once
-- when it is not.
local java_home = vim.env.JAVA_HOME

local function warn_without_java_home()
  vim.notify_once(
    "kotlin-lsp: JAVA_HOME is not set, so the Gradle import uses the newest JDK it finds and starts its own Gradle daemon",
    vim.log.levels.WARN
  )
end

return {
  cmd = { "intellij-server", "--stdio" },
  cmd_env = java_home and {
    IJ_JAVA_OPTIONS = "-Dcom.jetbrains.ls.imports.gradle.java.home=" .. java_home,
  } or nil,
  before_init = not java_home and warn_without_java_home or nil,
  filetypes = { "kotlin" },
  -- Earlier entries win: the Gradle settings file roots the project, so a
  -- module's nearer build.gradle.kts (app/) does not become a root of its own.
  root_markers = {
    { "settings.gradle.kts", "settings.gradle" },
    { "build.gradle.kts", "build.gradle", "pom.xml", "workspace.json" },
  },
}
