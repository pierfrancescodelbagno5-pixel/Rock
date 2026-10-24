#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SRBody.h"
#include "SRCompanion.generated.h"

class ASlimeCharacter;
class ASREnemy;

/**
 * A recruitable companion (Kaede the oni swordswoman, Liora the elven mage, Rhea the beastkin huntress).
 * Talk to raise affection; at 15 she joins your party and fights beside you, at 90 you can ask her to marry you.
 */
UCLASS()
class SLIMEREBORN_API ASRCompanion : public ACharacter
{
	GENERATED_BODY()

public:
	ASRCompanion();

	/** Call before FinishSpawning. */
	void Setup(int32 InIndex);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	FString Interact(ASlimeCharacter* Player);
	FString DisplayName() const;
	void AddAffection(float Amount);
	void ApplyState(float InAffection, bool bInRecruited, bool bInMarried);
	void ReturnHome();

	static constexpr int32 Num = 3;
	static FVector2D HomeOf(int32 Index);

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Companion") int32 Index = 0;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Companion") float Affection = 0.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Companion") bool bRecruited = false;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Companion") bool bMarried = false;

private:
	void BuildBody();
	void Follow(ASlimeCharacter* Player, float Dt);
	ASREnemy* PickTarget(ASlimeCharacter* Player) const;
	void AttackTarget(ASREnemy* E, ASlimeCharacter* Player);

	UPROPERTY() FSRRig Rig;
	FVector Home = FVector::ZeroVector;
	float Clock = 0.f;
	float WalkPhase = 0.f;
	float AttackCool = 0.f;
	float AttackAnim = 0.f;
	float TalkCool = 0.f;
	int32 LineIdx = 0;
	TWeakObjectPtr<ASREnemy> Target;
};
