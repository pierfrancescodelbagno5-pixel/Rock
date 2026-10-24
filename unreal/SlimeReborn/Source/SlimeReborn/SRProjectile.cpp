#include "SRProjectile.h"
#include "SREnemy.h"
#include "SlimeCharacter.h"
#include "SRFx.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "EngineUtils.h"

ASRProjectile::ASRProjectile()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Core = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Core"));
	Core->SetupAttachment(Root);
	Core->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Core->SetCastShadow(false);
	Light = CreateDefaultSubobject<UPointLightComponent>(TEXT("Light"));
	Light->SetupAttachment(Root);
	Light->SetCastShadows(false);
	Light->SetIntensity(8000.f);
	Light->SetAttenuationRadius(700.f);
	InitialLifeSpan = 6.f;
}

ASRProjectile* ASRProjectile::Fire(UWorld* World, AActor* Shooter, const FVector& From, const FVector& Dir, ESRSkill InSkill, float InDamage, bool bInFromEnemy)
{
	if (!World) return nullptr;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASRProjectile* Proj = World->SpawnActor<ASRProjectile>(ASRProjectile::StaticClass(), From, Dir.Rotation(), P);
	if (Proj) Proj->Init(Shooter, Dir.GetSafeNormal(), InSkill, InDamage, bInFromEnemy);
	return Proj;
}

void ASRProjectile::Init(AActor* Shooter, const FVector& Dir, ESRSkill InSkill, float InDamage, bool bInFromEnemy)
{
	Owner_ = Shooter;
	Skill = InSkill;
	Damage = InDamage;
	bFromEnemy = bInFromEnemy;
	Color = SR::Skill(Skill).Color;
	float Speed = 3000.f;
	FVector Scale(0.4f);
	switch (Skill)
	{
	case ESRSkill::WaterBlade:
		Speed = 4600.f; Radius = 110.f; bPierce = true; Life = 1.1f; Scale = FVector(0.25f, 1.5f, 0.08f);
		break;
	case ESRSkill::Fireball:
		Speed = bFromEnemy ? 1800.f : 2700.f; Radius = 90.f; ExplodeRadius = bFromEnemy ? 260.f : 480.f; Life = 2.2f; Scale = FVector(bFromEnemy ? 0.45f : 0.6f);
		break;
	case ESRSkill::StickyThread:
		Speed = bFromEnemy ? 2000.f : 3600.f; Radius = 80.f; Life = 1.3f; Scale = FVector(0.5f, 0.12f, 0.12f);
		break;
	case ESRSkill::PiercingArrow:
		Speed = 5200.f; Radius = 70.f; bPierce = true; Life = 1.0f; Scale = FVector(0.05f, 0.05f, 0.9f);
		break;
	default:
		break;
	}
	Velocity = Dir * Speed;
	const bool bRod = Skill == ESRSkill::StickyThread || Skill == ESRSkill::PiercingArrow;
	Core->SetStaticMesh(SR::Mesh(bRod ? TEXT("Cylinder") : TEXT("Sphere")));
	Core->SetRelativeScale3D(Scale);
	if (bRod) Core->SetRelativeRotation(FRotator(-90.f, 0, 0));
	Core->SetMaterial(0, SR::MakeMID(this, Color, ESRMat::Fx, 12.f));
	Light->SetLightColor(Color);
}

void ASRProjectile::HitTarget(AActor* Target)
{
	if (!Target || AlreadyHit.Contains(Target)) return;
	AlreadyHit.Add(Target);
	if (ASREnemy* E = Cast<ASREnemy>(Target))
	{
		E->TakeHit(Damage, Owner_.Get(), Skill == ESRSkill::WaterBlade ? 250.f : 450.f, false);
		if (Skill == ESRSkill::StickyThread) E->Snare(3.f);
		ASRFx::Spawn(GetWorld(), ESRFxKind::Spark, E->GetActorLocation(), Color, 120.f, 0.25f);
		if (ASlimeCharacter* P = Cast<ASlimeCharacter>(Owner_.Get())) P->OnDealtDamage(E, Damage);
	}
	else if (ASlimeCharacter* P = Cast<ASlimeCharacter>(Target))
	{
		P->ReceiveDamage(Damage, Owner_.Get());
		if (Skill == ESRSkill::StickyThread) P->Snare(1.5f);
	}
}

void ASRProjectile::Explode(const FVector& At)
{
	if (bDone) return;
	bDone = true;
	if (ExplodeRadius > 0.f)
	{
		ASRFx::Spawn(GetWorld(), ESRFxKind::Burst, At, Color, ExplodeRadius, 0.45f);
		if (bFromEnemy)
		{
			ASlimeCharacter* P = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
			if (P && FVector::Dist(P->GetActorLocation(), At) < ExplodeRadius + 40.f) HitTarget(P);
		}
		else
		{
			for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
			{
				if (!It->IsDead() && FVector::Dist(It->GetActorLocation(), At) < ExplodeRadius + It->GetRadius()) HitTarget(*It);
			}
			if (ASlimeCharacter* P = Cast<ASlimeCharacter>(Owner_.Get())) P->Shake(6.f, 0.25f);
		}
	}
	else
	{
		ASRFx::Spawn(GetWorld(), ESRFxKind::Spark, At, Color, 140.f, 0.25f);
	}
	Destroy();
}

void ASRProjectile::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bDone) return;
	Life -= DeltaSeconds;
	const FVector From = GetActorLocation();
	const FVector To = From + Velocity * DeltaSeconds;

	// World geometry (terrain, walls, trees)
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(SRProjectile), false, this);
	if (Owner_.IsValid()) Q.AddIgnoredActor(Owner_.Get());
	if (GetWorld()->LineTraceSingleByObjectType(Hit, From, To, FCollisionObjectQueryParams(ECC_WorldStatic), Q))
	{
		Explode(Hit.ImpactPoint);
		return;
	}
	SetActorLocation(To);
	if (Skill == ESRSkill::WaterBlade && !bDone) Core->AddLocalRotation(FRotator(0, 0, 900.f * DeltaSeconds));

	if (bFromEnemy)
	{
		ASlimeCharacter* P = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
		if (P && !P->bDead && FVector::Dist(P->GetActorLocation(), To) < Radius + P->GetSimpleCollisionRadius())
		{
			if (ExplodeRadius > 0.f) Explode(To);
			else { HitTarget(P); Explode(To); }
			return;
		}
	}
	else
	{
		for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
		{
			ASREnemy* E = *It;
			if (E->IsDead() || AlreadyHit.Contains(E)) continue;
			if (FVector::Dist(E->GetActorLocation(), To) < Radius + E->GetRadius() + 20.f)
			{
				if (ExplodeRadius > 0.f) { Explode(To); return; }
				HitTarget(E);
				if (!bPierce) { Explode(To); return; }
			}
		}
	}
	if (Life <= 0.f) Explode(To);
}
