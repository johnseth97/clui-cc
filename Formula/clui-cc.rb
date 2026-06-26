class CluiCc < Formula
  desc "Desktop overlay for Claude Code"
  homepage "https://github.com/johnseth97/clui-cc"
  version "0.1.0"

  on_macos do
    on_arm do
      url "https://github.com/johnseth97/clui-cc/releases/download/v0.1.0/clui-cc-0.1.0-arm64.zip"
      sha256 "REPLACE_WITH_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/johnseth97/clui-cc/releases/download/v0.1.0/clui-cc-0.1.0-x64.zip"
      sha256 "REPLACE_WITH_X64_SHA256"
    end
  end

  depends_on macos: :ventura

  def install
    prefix.install "Clui CC.app"
  end

  service do
    run [opt_prefix/"Clui CC.app/Contents/MacOS/Clui CC"]
    run_type :immediate
    keep_alive true
    log_path var/"log/clui-cc.log"
    error_log_path var/"log/clui-cc.log"
  end

  test do
    assert_predicate prefix/"Clui CC.app", :exist?
  end
end
