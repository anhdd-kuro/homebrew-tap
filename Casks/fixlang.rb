cask "fixlang" do
  version "0.10.14"
  sha256 "8eb20e920a93619f9a6db77cbc1295b690d1d8f453b77426b53a403836c7ee05"

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
