cask "fixlang" do
  version "0.7.2"
  sha256 "5b72c893f9536c8b3f45c9ffc64d6fb40d903ea6cd40f465469285505fab2b5e"

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
