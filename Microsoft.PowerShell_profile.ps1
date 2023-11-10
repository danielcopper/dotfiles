# -------------------------------------
# Aliases
# -------------------------------------

# This relies on git being on PATH
function dotfiles
{
    & git --git-dir="$HOME/.dotfiles/" --work-tree="$HOME" @args 
}

# -------------------------------------
# Starship
# -------------------------------------
$ENV:STARSHIP_CONFIG = "$HOME\.starship\starship.toml"
$ENV:STARSHIP_DISTRO = "者"
Invoke-Expression (&starship init powershell)

# -------------------------------------
# Posh-Git Autocompletions
# -------------------------------------
Import-Module posh-git

# -------------------------------------
# Catppuccin
# -------------------------------------

# https://github.com/catppuccin/powershell
#Import-Module Catppuccin
#$Flavor = $Catppuccin['Mocha']

# Modified from the built-in prompt function at: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_prompts
#function prompt {
#    $(if (Test-Path variable:/PSDebugContext) { "$($Flavor.Red.Foreground())[DBG]: " }
#      else { '' }) + "$($Flavor.Teal.Foreground())PS $($Flavor.Yellow.Foreground())" + $(Get-Location) +
#        "$($Flavor.Green.Foreground())" + $(if ($NestedPromptLevel -ge 1) { '>>' }) + '> ' + $($PSStyle.Reset)
#}
# The above example requires the automatic variable $PSStyle to be available, so can be only used in PS 7.2+
# Replace $PSStyle.Reset with "`e[0m" for PS 6.0 through PS 7.1 or "$([char]27)[0m" for PS 5.1

# The following colors are used by PowerShell's formatting
# Again PS 7.2+ only
#$PSStyle.Formatting.Debug = $Flavor.Sky.Foreground()
#$PSStyle.Formatting.Error = $Flavor.Red.Foreground()
#$PSStyle.Formatting.ErrorAccent = $Flavor.Blue.Foreground()
#$PSStyle.Formatting.FormatAccent = $Flavor.Teal.Foreground()
#$PSStyle.Formatting.TableHeader = $Flavor.Rosewater.Foreground()
#$PSStyle.Formatting.Verbose = $Flavor.Yellow.Foreground()
#$PSStyle.Formatting.Warning = $Flavor.Peach.Foreground()

# -------------------------------------
# Winget
# -------------------------------------
Register-ArgumentCompleter -Native -CommandName winget -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    [Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding = [System.Text.Utf8Encoding]::new()
    $Local:word = $wordToComplete.Replace('"', '""')
    $Local:ast = $commandAst.ToString().Replace('"', '""')
    winget complete --word="$Local:word" --commandline "$Local:ast" --position $cursorPosition | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}

# -------------------------------------
# dotNET
# -------------------------------------
# PowerShell parameter completions for the dotnet CLI
Register-ArgumentCompleter -Native -CommandName dotnet -ScriptBlock {
    param($commandName, $wordToComplete, $cursorPosition)
    dotnet complete --position $cursorPosition "$wordToComplete" | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}

# Test these
# Set-PSReadLineOption -PredictionSource History
# Set-PSReadLineOption -PredictionViewStyle ListView
# Set-PSReadLineOption -EditMode Windows
# Register-ArgumentCompleter -Native -CommandName dotnet -ScriptBlock {
#     param($commandName, $wordToComplete, $cursorPosition)
#     dotnet complete --position $cursorPosition "$wordToComplete" | ForEach-Object {
#         [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
#     }
# }
