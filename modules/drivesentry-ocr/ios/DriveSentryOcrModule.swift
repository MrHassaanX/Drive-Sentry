import ExpoModulesCore
import Vision
import ImageIO

public class DriveSentryOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DriveSentryOcr")
    AsyncFunction("recognize") { (value: String) throws -> String in
      guard let url = URL(string: value), url.isFileURL,
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = props[kCGImagePropertyPixelWidth] as? Int,
        let height = props[kCGImagePropertyPixelHeight] as? Int,
        width > 0, height > 0, Double(width) * Double(height) <= 32_000_000
      else {
        throw NSError(domain: "DriveSentryOcr", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Choose a readable local image under 32 megapixels."])
      }
      let orientation = (props[kCGImagePropertyOrientation] as? UInt32)
        .flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      try VNImageRequestHandler(url: url, orientation: orientation).perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
  }
}
