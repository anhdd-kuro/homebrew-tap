cask "fixlang" do
  version "0.10.2"
  sha256 "5f124ea1113030d9be3787dfbb7648132adfbbd82c5bd2cae41ceaf0f52cb52d"

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
