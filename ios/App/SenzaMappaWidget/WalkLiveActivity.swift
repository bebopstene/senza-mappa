// Live Activity della camminata: schermata di blocco e Dynamic Island.
// Alla cieca (R4): tempo e contatori, niente mappe, coordinate o direzioni.
import ActivityKit
import SwiftUI
import WidgetKit

private let nero = Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x11 / 255)
private let cemento = Color(red: 0xD6 / 255, green: 0xD3 / 255, blue: 0xCB / 255)
private let ambra = Color(red: 0xF2 / 255, green: 0xB2 / 255, blue: 0x30 / 255)

private func titolo(_ size: CGFloat) -> Font { .system(size: size, weight: .black, design: .default) }
private func mono(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font { .system(size: size, weight: weight, design: .monospaced) }

/// cronometro che conta in avanti da solo, senza aggiornamenti dall'app
private struct Elapsed: View {
    let from: Date
    var body: some View {
        Text(timerInterval: from...Date.distantFuture, countsDown: false, showsHours: true)
            .monospacedDigit()
    }
}

private struct Box: View {
    let label: String
    let value: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(value)").font(titolo(30)).foregroundColor(ambra).monospacedDigit()
            Text(label).font(mono(12)).foregroundColor(cemento)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().strokeBorder(cemento, lineWidth: 3))
    }
}

private struct LockScreen: View {
    let context: ActivityViewContext<WalkActivityAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(context.attributes.name.isEmpty ? "SENZA MAPPA" : context.attributes.name.uppercased())
                    .font(mono(13))
                    .foregroundColor(cemento)
                    .lineLimit(1)
                Spacer()
                Text("ALLA CIECA").font(mono(12)).foregroundColor(nero)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(ambra)
            }
            Elapsed(from: context.attributes.startedAt)
                .font(titolo(44))
                .foregroundColor(cemento)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            HStack(spacing: 10) {
                Box(label: "BANGLA", value: context.state.bangla)
                Box(label: "CHECK", value: context.state.checkpoint)
            }
            HStack(spacing: 6) {
                Text("DALL’ULTIMO PUNTO").font(mono(12)).foregroundColor(cemento)
                Elapsed(from: context.state.lastPointAt).font(mono(12)).foregroundColor(ambra)
            }
        }
        .padding(16)
    }
}

struct WalkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WalkActivityAttributes.self) { context in
            LockScreen(context: context)
                .activityBackgroundTint(nero)
                .activitySystemActionForegroundColor(cemento)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("\(context.state.bangla)").font(titolo(28)).foregroundColor(ambra)
                        Text("BANGLA").font(mono(11)).foregroundColor(cemento)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(context.state.checkpoint)").font(titolo(28)).foregroundColor(ambra)
                        Text("CHECK").font(mono(11)).foregroundColor(cemento)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Elapsed(from: context.attributes.startedAt)
                        .font(titolo(30))
                        .foregroundColor(cemento)
                        .multilineTextAlignment(.center)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 6) {
                        Text("DALL’ULTIMO PUNTO").font(mono(12)).foregroundColor(cemento)
                        Elapsed(from: context.state.lastPointAt).font(mono(12)).foregroundColor(ambra)
                    }
                }
            } compactLeading: {
                Text("B\(context.state.bangla)").font(mono(14, .black)).foregroundColor(ambra)
            } compactTrailing: {
                Elapsed(from: context.attributes.startedAt)
                    .font(mono(14))
                    .foregroundColor(cemento)
                    .frame(maxWidth: 64)
            } minimal: {
                Text("\(context.state.bangla)").font(mono(14, .black)).foregroundColor(ambra)
            }
            .keylineTint(ambra)
        }
    }
}
