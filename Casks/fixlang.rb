cask "fixlang" do
  version "0.8.7"
  sha256 "c51ae4c716a83e014caaab83b8483068aa5d3fe73976b2406e7d71d6b20b1dbb"

  url "https://github.com/anhdd-kuro/fix-lang/releases/download/v#{version}/FixLang-#{version}-arm64.dmg"
  name "FixLang"
  desc "AI-powered writing correction for selected text"
  homepage "https://github.com/anhdd-kuro/fix-lang"

  depends_on arch: :arm64
  depends_on :macos

  app "FixLang.app"

  caveats do
    unsigned_accessibility
    <<~EOS
      FixLang is currently unsigned. If macOS blocks an app you downloaded
      from this trusted release, run:

        xattr -dr com.apple.quarantine "/Applications/FixLang.app"
    EOS
  end
end
