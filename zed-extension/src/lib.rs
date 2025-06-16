use zed::{LanguageServerId, Result, Worktree};
use zed_extension_api as zed;

struct TjsTypecheckerExtension;

impl zed::Extension for TjsTypecheckerExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        _worktree: &Worktree,
    ) -> Result<zed::Command> {
        match language_server_id.as_ref() {
            "tjs" => Ok(zed::Command {
                command: "/Users/manne/dev/tjs/lang-server".to_string(),
                args: vec!["--stdio".to_string()],
                env: Default::default(),
            }),
            language_server_id => Err(format!("unknown language server: {language_server_id}"))?,
        }
    }
}

zed::register_extension!(TjsTypecheckerExtension);
