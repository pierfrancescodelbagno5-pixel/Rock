#include "SREnemy.h"
#include "SlimeCharacter.h"
#include "SRGameMode.h"
#include "SRProjectile.h"
#include "SRFx.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

ASREnemy::ASREnemy()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	GetCapsuleComponent()->InitCapsuleSize(36.f, 90.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0, 420.f, 0);
	Move->bRunPhysicsWithNoController = true;
	Move->MaxAcceleration = 2400.f;
	bUseControllerRotationYaw = false;
}

void ASREnemy::Setup(ESREnemyKind InKind, int32 InLevel, int32 InZone, float InElite)
{
	EliteMult = FMath::Max(1.f, InElite);
	Kind = InKind;
	Level = FMath::Max(1, InLevel);
	Zone = InZone;
}

float ASREnemy::Now() const
{
	return GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
}

void ASREnemy::BeginPlay()
{
	Super::BeginPlay();
	const FSREnemyInfo& I = SR::Enemy(Kind);
	const float L = static_cast<float>(Level - 1);
	MaxHP = I.HP * (1.f + 0.28f * L);
	HP = MaxHP;
	Atk = I.Atk * (1.f + 0.17f * L);
	XPValue = I.XP * (1.f + 0.22f * L);
	Speed = I.Speed;
	Reach = I.Reach;
	Scale = I.Scale;
	bBoss = Kind == ESREnemyKind::OrcKing || EliteMult > 1.f;
	if (EliteMult > 1.f)
	{
		MaxHP *= EliteMult;
		HP = MaxHP;
		Atk *= FMath::Sqrt(EliteMult);
		XPValue *= EliteMult;
		Scale *= 1.3f;
	}
	Aggro = bBoss ? 3800.f : (Kind == ESREnemyKind::Wolf ? 2800.f : 2200.f);
	GetCharacterMovement()->MaxWalkSpeed = Speed;
	Home = GetActorLocation();
	WanderTarget = Home;
	WalkPhase = FMath::FRandRange(0.f, 6.f);
	BuildBody();
}

float ASREnemy::GetRadius() const
{
	return GetCapsuleComponent()->GetScaledCapsuleRadius();
}

void ASREnemy::BuildBody()
{
	float Radius = 36.f;
	FSRHumanStyle S;
	bool bHumanoid = true;
	switch (Kind)
	{
	case ESREnemyKind::Goblin:
		S.Skin = SR::Hex(0x6a9a3a); S.Shirt = SR::Hex(0x5a4026); S.Pants = SR::Hex(0x4a3420); S.bPointyEars = true; S.bBald = true;
		S.Weapon = 4; S.Eyes = FLinearColor(1.f, 0.8f, 0.1f); S.bGlowEyes = true; S.Height = 0.72f * Scale;
		break;
	case ESREnemyKind::Orc:
		S.Skin = SR::Hex(0x5d6e34); S.Shirt = SR::Hex(0x4a3020); S.Pants = SR::Hex(0x3a2a1a); S.bTusks = true; S.bBald = true;
		S.Bulk = 1.55f; S.Weapon = 5; S.Eyes = FLinearColor(1.f, 0.15f, 0.05f); S.bGlowEyes = true; S.Height = Scale;
		Radius = 50.f;
		break;
	case ESREnemyKind::Lizardman:
		S.Skin = SR::Hex(0x3e7a5a); S.Shirt = SR::Hex(0x6a4a2a); S.Pants = SR::Hex(0x3e7a5a); S.Accent = SR::Hex(0x2a5a3a);
		S.bSnout = true; S.bTail = true; S.bBald = true; S.Weapon = 2; S.Eyes = FLinearColor(1.f, 0.85f, 0.1f); S.bGlowEyes = true; S.Height = Scale;
		break;
	case ESREnemyKind::Knight:
		S.Shirt = SR::Hex(0x3a3f4a); S.Pants = SR::Hex(0x2a2e36); S.Cape = SR::Hex(0x4a1010); S.bCape = true; S.bHelmet = true;
		S.Weapon = 6; S.Accent = SR::Hex(0x8a6a2a); S.Height = Scale; S.Bulk = 1.15f;
		Radius = 42.f;
		break;
	case ESREnemyKind::OrcKing:
		S.Skin = SR::Hex(0x4e5e2a); S.Shirt = SR::Hex(0x2a1a12); S.Pants = SR::Hex(0x2a1a12); S.bTusks = true; S.bBald = true; S.bCrown = true;
		S.bCape = true; S.Cape = SR::Hex(0x4a1a6a); S.Bulk = 1.8f; S.Weapon = 5; S.Eyes = FLinearColor(1.f, 0.1f, 0.6f); S.bGlowEyes = true; S.Height = Scale;
		Radius = 46.f * 1.6f;
		break;
	default:
		bHumanoid = false;
		break;
	}

	if (bHumanoid)
	{
		HalfHeight = 92.f * S.Height;
		Radius *= FMath::Max(0.75f, S.Height);
	}
	else if (Kind == ESREnemyKind::Wolf)
	{
		HalfHeight = 48.f * Scale;
		Radius = 48.f * Scale;
	}
	else
	{
		HalfHeight = 45.f * Scale;
		Radius = 62.f * Scale;
	}
	GetCapsuleComponent()->SetCapsuleSize(Radius, HalfHeight);
	BodyBase = SR::AddPivot(this, GetCapsuleComponent(), FVector(0, 0, -HalfHeight));

	if (bHumanoid) Rig = SR::BuildHumanoid(this, BodyBase, S);
	else if (Kind == ESREnemyKind::Wolf) Rig = SR::BuildWolf(this, BodyBase, SR::Hex(0x5a6273), FLinearColor(0.25f, 0.8f, 1.f), Scale);
	else Rig = SR::BuildSpider(this, BodyBase, SR::Hex(0x2e2620), Scale);
}

FString ASREnemy::DisplayName() const
{
	return FString::Printf(TEXT("%s%s  Lv.%d"), EliteMult > 1.f ? TEXT("Campione: ") : TEXT(""), SR::Enemy(Kind).Name, Level);
}

FVector ASREnemy::GetHeadLocation() const
{
	return GetActorLocation() + FVector(0, 0, HalfHeight + 40.f * Scale);
}

void ASREnemy::SetState(EState S)
{
	State = S;
	StateTime = 0.f;
}

float ASREnemy::WindupTime() const
{
	float T = 0.55f;
	switch (Kind)
	{
	case ESREnemyKind::Goblin: T = 0.45f; break;
	case ESREnemyKind::Wolf: T = 0.38f; break;
	case ESREnemyKind::Spider: T = 0.5f; break;
	case ESREnemyKind::Orc: T = 0.72f; break;
	case ESREnemyKind::Lizardman: T = 0.55f; break;
	case ESREnemyKind::Knight: T = 0.62f; break;
	case ESREnemyKind::OrcKing: T = AttackKind == 1 ? 1.2f : 0.85f; break;
	}
	return bEnraged ? T * 0.7f : T;
}

void ASREnemy::Snare(float Seconds)
{
	SnareTime = FMath::Max(SnareTime, bBoss ? Seconds * 0.3f : Seconds);
}

bool ASREnemy::TakeHit(float Damage, AActor* Source, float Knockback, bool bHeavy)
{
	if (bDead) return false;
	HP -= Damage;
	LastHitTime = Now();
	FlashTime = 0.16f;
	if (State == EState::Idle || State == EState::Return) SetState(EState::Chase);

	if (Source)
	{
		FVector Dir = GetActorLocation() - Source->GetActorLocation();
		Dir.Z = 0.f;
		Dir.Normalize();
		const float K = bBoss ? Knockback * 0.1f : Knockback;
		if (K > 1.f) LaunchCharacter(Dir * K + FVector(0, 0, bHeavy ? 260.f : 90.f), true, true);
	}
	// Poise: light hits interrupt weak monsters, heavy hits interrupt everything but the king.
	if (!bBoss && (bHeavy || State != EState::Windup || Kind == ESREnemyKind::Goblin))
	{
		SetState(EState::Stagger);
	}
	if (bBoss && !bEnraged && HP < MaxHP * 0.5f)
	{
		bEnraged = true;
		GetCharacterMovement()->MaxWalkSpeed = Speed * 1.35f;
		if (ASlimeCharacter* P = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)))
		{
			P->Oracle(Kind == ESREnemyKind::OrcKing ? FString(TEXT("Il Re degli Orchi e' in preda alla Fame! I suoi colpi sono piu' rapidi."))
				: FString::Printf(TEXT("%s e' infuriato! Attacca piu' in fretta."), *DisplayName()));
		}
		ASRFx::Spawn(GetWorld(), ESRFxKind::Ring, GetActorLocation() - FVector(0, 0, HalfHeight - 20.f), FLinearColor(0.6f, 0.f, 0.8f), 1400.f, 0.8f);
	}
	if (HP <= 0.f)
	{
		HP = 0.f;
		Die();
		return true;
	}
	return false;
}

void ASREnemy::Die()
{
	bDead = true;
	DeadTime = 0.f;
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Pawn, ECR_Ignore);
	Rig.Flash(0.f);
	if (ASRGameMode* GM = GetWorld()->GetAuthGameMode<ASRGameMode>())
	{
		GM->OnEnemyKilled(this);
	}
}

void ASREnemy::MarkAbsorbed()
{
	bAbsorbed = true;
	DeadTime = FMath::Max(DeadTime, 40.f);
}

void ASREnemy::DoAttack(ASlimeCharacter* Player)
{
	if (!Player) return;
	UWorld* W = GetWorld();
	const FVector To = Player->GetActorLocation() - GetActorLocation();
	const float Dist = To.Size2D();
	const FVector Fwd = GetActorForwardVector();
	const FVector Dir2D = FVector(To.X, To.Y, 0.f).GetSafeNormal();
	const FVector Feet = GetActorLocation() - FVector(0, 0, HalfHeight - 10.f);
	++AttackCount;

	if (AttackKind == 1)
	{
		switch (Kind)
		{
		case ESREnemyKind::Lizardman:
			ASRProjectile::Fire(W, this, GetHeadLocation() - FVector(0, 0, 30.f), (Player->GetActorLocation() - GetHeadLocation()).GetSafeNormal(), ESRSkill::Fireball, Atk * 1.2f, true);
			return;
		case ESREnemyKind::Spider:
			ASRProjectile::Fire(W, this, GetActorLocation(), (Player->GetActorLocation() - GetActorLocation()).GetSafeNormal(), ESRSkill::StickyThread, Atk * 0.6f, true);
			return;
		case ESREnemyKind::OrcKing:
		{
			const FVector Center = Feet + Fwd * 300.f;
			ASRFx::Spawn(W, ESRFxKind::Ring, Center, FLinearColor(1.f, 0.35f, 0.05f), 900.f, 0.7f);
			ASRFx::Spawn(W, ESRFxKind::Burst, Center, FLinearColor(1.f, 0.5f, 0.1f), 380.f, 0.4f);
			if (FVector::Dist2D(Center, Player->GetActorLocation()) < 900.f) Player->ReceiveDamage(Atk * 1.6f, this);
			Player->Shake(18.f, 0.5f);
			return;
		}
		default:
			break;
		}
	}

	if (Kind == ESREnemyKind::Wolf) LaunchCharacter(Dir2D * 900.f + FVector(0, 0, 120.f), true, true);
	const bool bInFront = FVector::DotProduct(Fwd, Dir2D) > 0.35f;
	if (Dist <= Reach + 70.f + Player->GetSimpleCollisionRadius() && bInFront)
	{
		Player->ReceiveDamage(Atk, this);
	}
	ASRFx::Spawn(W, ESRFxKind::Slash, GetActorLocation() + Fwd * Reach * 0.6f, FLinearColor(1.f, 0.9f, 0.8f), Reach * 0.9f, 0.18f, GetActorRotation());
}

void ASREnemy::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;

	// Hit flash
	if (FlashTime > 0.f)
	{
		FlashTime -= DeltaSeconds;
		Rig.Flash(FMath::Max(0.f, FlashTime) / 0.16f);
	}

	if (bDead)
	{
		DeadTime += DeltaSeconds;
		const float Fall = FMath::Clamp(DeadTime / 0.5f, 0.f, 1.f);
		if (BodyBase) BodyBase->SetRelativeRotation(FRotator(0, 0, Fall * 85.f));
		if (!bAbsorbed && Rig.IsValid())
		{
			// Absorbable corpses pulse with a faint blue aura
			Rig.Flash(0.25f + 0.2f * FMath::Sin(Clock * 4.f), FLinearColor(0.2f, 0.6f, 1.f));
		}
		if (bAbsorbed && BodyBase)
		{
			const float Shrink = FMath::Clamp(1.f - (DeadTime - 40.f) / 0.6f, 0.01f, 1.f);
			BodyBase->SetRelativeScale3D(FVector(Shrink));
		}
		if (DeadTime > 34.f && !bAbsorbed) AddActorWorldOffset(FVector(0, 0, -40.f * DeltaSeconds));
		if (DeadTime > 41.f) Destroy();
		return;
	}

	ASlimeCharacter* Player = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	ASRGameMode* GM = GetWorld()->GetAuthGameMode<ASRGameMode>();
	const bool bPlayerOk = Player && !Player->bDead && !(GM && GM->bInMenu);
	const FVector Me = GetActorLocation();
	const FVector To = bPlayerOk ? Player->GetActorLocation() - Me : FVector::ZeroVector;
	const float Dist = bPlayerOk ? To.Size2D() : 1e9f;

	if (SnareTime > 0.f)
	{
		SnareTime -= DeltaSeconds;
		GetCharacterMovement()->MaxWalkSpeed = 0.f;
		Rig.Flash(0.4f, FLinearColor(0.95f, 0.95f, 0.9f));
		if (SnareTime <= 0.f)
		{
			GetCharacterMovement()->MaxWalkSpeed = bEnraged ? Speed * 1.35f : Speed;
			Rig.Flash(0.f);
		}
	}

	StateTime += DeltaSeconds;
	switch (State)
	{
	case EState::Idle:
	{
		const FVector W = WanderTarget - Me;
		if (W.Size2D() < 120.f)
		{
			WanderWait -= DeltaSeconds;
			if (WanderWait <= 0.f)
			{
				const float A = FMath::FRandRange(0.f, 2.f * PI);
				const float D = FMath::FRandRange(200.f, 1500.f);
				WanderTarget = Home + FVector(FMath::Cos(A) * D, FMath::Sin(A) * D, 0.f);
				if (SR::HeightAt(WanderTarget.X, WanderTarget.Y) < 30.f) WanderTarget = Home;
				WanderWait = FMath::FRandRange(2.f, 6.f);
			}
		}
		else
		{
			AddMovementInput(FVector(W.X, W.Y, 0.f).GetSafeNormal(), 0.35f);
		}
		if (Dist < Aggro) SetState(EState::Chase);
		break;
	}
	case EState::Return:
	{
		const FVector W = Home - Me;
		HP = FMath::Min(MaxHP, HP + MaxHP * 0.2f * DeltaSeconds);
		AddMovementInput(FVector(W.X, W.Y, 0.f).GetSafeNormal(), 1.f);
		if (W.Size2D() < 300.f) SetState(EState::Idle);
		break;
	}
	case EState::Chase:
	{
		if (!bPlayerOk || Dist > Aggro * 2.4f || FVector::Dist2D(Me, Home) > 12000.f)
		{
			SetState(EState::Return);
			break;
		}
		AddMovementInput(FVector(To.X, To.Y, 0.f).GetSafeNormal(), 1.f);
		const bool bRanged = (Kind == ESREnemyKind::Lizardman || Kind == ESREnemyKind::Spider) && Dist > 500.f && Dist < 1600.f && StateTime > 1.2f && FMath::FRand() < DeltaSeconds * 0.8f;
		if (Dist < Reach + GetRadius() || bRanged)
		{
			AttackKind = bRanged ? 1 : 0;
			if (bBoss && AttackCount % 3 == 2) AttackKind = 1;
			SetState(EState::Windup);
		}
		break;
	}
	case EState::Windup:
	{
		if (bPlayerOk)
		{
			const FRotator Want(0, To.Rotation().Yaw, 0);
			SetActorRotation(FMath::RInterpTo(GetActorRotation(), Want, DeltaSeconds, 7.f));
		}
		const float T = StateTime / WindupTime();
		Rig.Flash(0.35f * FMath::Abs(FMath::Sin(T * PI * 3.f)), FLinearColor(1.f, 0.15f, 0.05f));
		if (Rig.ArmR) Rig.ArmR->SetRelativeRotation(FRotator(T * 160.f, 0, 10.f));
		if (Rig.Head && Rig.bQuadruped) Rig.Head->SetRelativeRotation(FRotator(T * 25.f, 0, 0));
		if (StateTime >= WindupTime())
		{
			Rig.Flash(0.f);
			DoAttack(Player);
			SetState(EState::Recover);
		}
		break;
	}
	case EState::Recover:
	{
		const float T = FMath::Clamp(StateTime / 0.15f, 0.f, 1.f);
		if (Rig.ArmR) Rig.ArmR->SetRelativeRotation(FRotator(FMath::Lerp(160.f, -20.f, T), 0, 10.f));
		if (StateTime > (bEnraged ? 0.45f : 0.75f)) SetState(EState::Chase);
		break;
	}
	case EState::Stagger:
		if (StateTime > 0.35f) SetState(EState::Chase);
		break;
	}

	// Locomotion animation (attack poses override the right arm)
	const float Vel = GetVelocity().Size2D();
	const float Amount = FMath::Clamp(Vel / FMath::Max(100.f, Speed), 0.f, 1.f);
	WalkPhase += DeltaSeconds * (3.f + Vel * 0.02f / Scale);
	if (State != EState::Windup && State != EState::Recover)
	{
		Rig.Walk(WalkPhase, Amount, Clock);
	}
	else
	{
		const float RArm = Rig.ArmR ? Rig.ArmR->GetRelativeRotation().Pitch : 0.f;
		Rig.Walk(WalkPhase, Amount * 0.3f, Clock);
		if (Rig.ArmR) Rig.ArmR->SetRelativeRotation(FRotator(RArm, 0, 10.f));
	}
	if (State == EState::Stagger && BodyBase)
	{
		BodyBase->SetRelativeRotation(FRotator(-12.f * FMath::Sin(StateTime * 20.f), 0, 0));
	}
	else if (BodyBase)
	{
		BodyBase->SetRelativeRotation(FRotator::ZeroRotator);
	}
}
