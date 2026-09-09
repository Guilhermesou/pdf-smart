import Foundation
import Vision
import CoreML
import ImageIO

struct Input: Decodable { let image: String?; let probe: Bool? }
struct Output: Encodable {
    var elapsedMs: Double = 0
    var text = ""
    var confidence: Float = 0
    var engine = "apple-vision"
    var acceleration = "system"
    var error: String?
}
func request() -> (VNRecognizeTextRequest, Bool) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["pt-BR", "en-US"]
    var neural = false
    if #available(macOS 14.0, *) {
        if let stages = try? request.supportedComputeStageDevices {
            for (stage, devices) in stages {
                if let device = devices.first(where: { if case .neuralEngine = $0 { return true }; return false }) {
                    request.setComputeDevice(device, for: stage)
                    neural = true
                }
            }
        }
    }
    return (request, neural)
}
func process(_ input: Input) throws -> Output {
    let (ocr, neural) = request()
    if input.probe == true { return Output(acceleration: neural ? "neural-engine-available" : "system") }
    guard let encoded = input.image, encoded.count <= 24_000_000,
          let data = Data(base64Encoded: encoded),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          image.width * image.height <= 20_000_000 else {
        return Output(error: "Imagem inválida ou muito grande.")
    }
    let handler = VNImageRequestHandler(cgImage: image)
    var acceleration = neural ? "neural-engine-requested" : "system"
    do { try handler.perform([ocr]) }
    catch {
        // A supported device may still reject a particular request. Let Vision select.
        guard neural else { throw error }
        if #available(macOS 14.0, *) {
            for stage in (try? ocr.supportedComputeStageDevices)?.keys ?? Dictionary<VNComputeStage, [MLComputeDevice]>().keys {
                ocr.setComputeDevice(nil, for: stage)
            }
        }
        acceleration = "system-fallback"
        try handler.perform([ocr])
    }
    let candidates = (ocr.results ?? []).compactMap { $0.topCandidates(1).first }
    let confidence = candidates.isEmpty ? 0 : candidates.reduce(Float(0)) { $0 + $1.confidence } / Float(candidates.count) * 100
    return Output(text: candidates.map { $0.string }.joined(separator: "\n"), confidence: confidence, acceleration: acceleration)
}
// One process per app: model initialization is amortized across pages.
while let line = readLine() {
    autoreleasepool {
        let started = ProcessInfo.processInfo.systemUptime
        var result: Output
        do { result = try process(JSONDecoder().decode(Input.self, from: Data(line.utf8))) }
        catch { result = Output(error: "Falha no reconhecimento nativo: \(error.localizedDescription)") }
        result.elapsedMs = (ProcessInfo.processInfo.systemUptime - started) * 1000
        if let data = try? JSONEncoder().encode(result), let json = String(data: data, encoding: .utf8) { print(json); fflush(stdout) }
    }
}
