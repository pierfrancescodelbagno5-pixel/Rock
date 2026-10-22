#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SRTypes.h"
#include "SRProjectile.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;

/** Magic projectile (water blade, fireball, sticky thread...). Fired by the player or by monsters. */
UCLASS()
class SLIMEREBORN_API ASRProjectile : public AActor
{
	GENERATED_BODY()

public:
	ASRProjectile();

	static ASRProjectile* Fire(UWorld* World, AActor* Shooter, const FVector& From, const FVector& Dir, ESRSkill Skill, float Damage, bool bFromEnemy);

	virtual void Tick(float DeltaSeconds) override;

private:
	void Init(AActor* Shooter, const FVector& Dir, ESRSkill InSkill, float InDamage, bool bInFromEnemy);
	void Explode(const FVector& At);
	void HitTarget(AActor* Target);

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Core;
	UPROPERTY() TObjectPtr<UPointLightComponent> Light;
	TWeakObjectPtr<AActor> Owner_;
	TSet<AActor*> AlreadyHit;
	FVector Velocity = FVector::ZeroVector;
	FLinearColor Color = FLinearColor::White;
	ESRSkill Skill = ESRSkill::WaterBlade;
	float Damage = 10.f;
	float Radius = 80.f;
	float ExplodeRadius = 0.f;
	float Life = 1.5f;
	bool bPierce = false;
	bool bFromEnemy = false;
	bool bDone = false;
};
