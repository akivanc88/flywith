import SwiftUI

struct CriteriaSelectorView: View {
    @Binding var selected: TravelerCriteria
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Text("Who's traveling with you?")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)

                    ForEach(TravelerCriteria.allCases) { criteria in
                        CriteriaCard(criteria: criteria, isSelected: selected == criteria) {
                            selected = criteria
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { dismiss() }
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("How FlyWith scores stopovers")
                            .font(.subheadline).fontWeight(.semibold)
                        Text("FlyWith scores each potential stopover city across 20+ attributes: airport accessibility, visa requirements, child-friendly attractions, walking distances, senior care facilities, hotel prices, and more. Your profile determines which attributes are weighted highest.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(FWColor.surfaceSunken)
                    .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("Travel Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

struct CriteriaCard: View {
    let criteria: TravelerCriteria
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                Text(criteria.emoji)
                    .font(.system(size: 36))
                    .frame(width: 56, height: 56)
                    .background(isSelected ? FWColor.surfaceAccentSoft : FWColor.surfaceSunken)
                    .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))

                VStack(alignment: .leading, spacing: 4) {
                    Text(criteria.displayName).font(.headline).foregroundStyle(.primary)
                    Text(criteria.description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(FWColor.brandAccent).font(.title3)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? FWColor.surfaceAccentSoft : FWColor.surfaceCard)
                    .overlay(RoundedRectangle(cornerRadius: FWRadius.xl).stroke(isSelected ? FWColor.brandAccent : FWColor.borderDefault, lineWidth: isSelected ? 2 : 0.5))
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }
}

#Preview { CriteriaSelectorView(selected: .constant(.withKids)) }
