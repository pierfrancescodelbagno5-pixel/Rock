#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SRBody.h"
#include "SREnemy.generated.h"

class ASlimeCharacter;

/** Monsters of the Broken Lands: goblins, storm wolves, spiders, orcs, lizardmen, fallen knights and the Orc King. */
UCLASS()
class SLIMEREBORN_API ASREnemy : public ACharacter
{
	GENERATED_BODY()

public:
	ASREnemy();

	/** Call before FinishSpawning. */
	void Setup(ESREnemyKind InKind, int32 InLevel, int32 InZone);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Returns true if this hit killed the enemy. */
	bool TakeHit(float Damage, AActor* Source, float Knockback = 350.f, bool bHeavy = false);
	void Snare(float Seconds);
	bool IsDead() const { return bDead; }
	bool CanBeAbsorbed() const { return bDead && !bAbsorbed; }
	void MarkAbsorbed();
	bool IsEngaged() const { return !bDead && State != EState::Idle; }
	FString DisplayName() const;
	FVector GetHeadLocation() const;
	float GetRadius() const;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") ESREnemyKind Kind = ESREnemyKind::Goblin;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") int32 Level = 1;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") int32 Zone = -1;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") float HP = 50.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") float MaxHP = 50.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") float Atk = 5.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Enemy") float XPValue = 10.f;
	float LastHitTime = -100.f;
	bool bBoss = false;

private:
	enum class EState : uint8 { Idle, Chase, Windup, Recover, Stagger, Return };

	void BuildBody();
	void Die();
	void DoAttack(ASlimeCharacter* Player);
	void SetState(EState S);
	float WindupTime() const;
	float Now() const;

	UPROPERTY() FSRRig Rig;
	UPROPERTY() TObjectPtr<USceneComponent> BodyBase;
	EState State = EState::Idle;
	float StateTime = 0.f;
	float Clock = 0.f;
	float WalkPhase = 0.f;
	float FlashTime = 0.f;
	float SnareTime = 0.f;
	float DeadTime = 0.f;
	float Reach = 200.f;
	float Speed = 400.f;
	float Aggro = 2200.f;
	float HalfHeight = 90.f;
	float Scale = 1.f;
	int32 AttackCount = 0;
	int32 AttackKind = 0;
	bool bDead = false;
	bool bAbsorbed = false;
	bool bEnraged = false;
	FVector Home = FVector::ZeroVector;
	FVector WanderTarget = FVector::ZeroVector;
	float WanderWait = 0.f;
};
