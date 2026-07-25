cask "fixlang" do
  version "0.3.3"
  sha256 "5030587db8ef20ddd5415bbd5e6c8213628ed79ed9fe29052944bb286229e045"

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
