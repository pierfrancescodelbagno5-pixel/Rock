#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SRBody.h"
#include "SRNPC.generated.h"

class ASlimeCharacter;

UENUM(BlueprintType)
enum class ESRNPCRole : uint8
{
	Citizen,
	Child,
	GuildMaster,
	Merchant,
	Blacksmith,
	Priestess,
	Guard,
	Bard
};

/** A talkable inhabitant of Altheria. Wanders around its home and turns to face the player. */
UCLASS()
class SLIMEREBORN_API ASRNPC : public ACharacter
{
	GENERATED_BODY()

public:
	ASRNPC();

	/** Call before FinishSpawning. */
	void Setup(const FString& InName, ESRNPCRole InRole, int32 InSeed, float InWanderRadius);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Player pressed Interact: returns the line to show (and applies shop/quest effects). */
	FString Interact(ASlimeCharacter* Player);
	/** "Parla", "Commercia", ... */
	FString PromptVerb() const;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC") FString NPCName;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC") ESRNPCRole NPCRole = ESRNPCRole::Citizen;
	UPROPERTY(VisibleAnywhere, Category = "NPC") int32 Seed = 0;
	UPROPERTY(VisibleAnywhere, Category = "NPC") float WanderRadius = 0.f;

private:
	void BuildBody();
	FString CitizenLine(ASlimeCharacter* Player);

	UPROPERTY() FSRRig Rig;
	FVector Home = FVector::ZeroVector;
	FVector Target = FVector::ZeroVector;
	float WaitTime = 0.f;
	float WalkPhase = 0.f;
	float TalkTime = 0.f;
	float Clock = 0.f;
	int32 LineIndex = 0;
	TWeakObjectPtr<AActor> Listener;
};
