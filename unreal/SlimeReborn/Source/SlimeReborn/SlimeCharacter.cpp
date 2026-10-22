#include "SlimeCharacter.h"
#include "SREnemy.h"
#include "SRNPC.h"
#include "SRHUD.h"
#include "SRGameMode.h"
#include "SRProjectile.h"
#include "SRFx.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InputComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"
#include "HAL/PlatformTime.h"
#include "InputCoreTypes.h"

ASlimeCharacter::ASlimeCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(45.f, 45.f);

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* M = GetCharacterMovement();
	M->bOrientRotationToMovement = true;
	M->RotationRate = FRotator(0.f, 720.f, 0.f);
	M->JumpZVelocity = 750.f;
	M->AirControl = 0.5f;
	M->MaxWalkSpeed = 520.f;
	M->BrakingDecelerationWalking = 2600.f;
	M->GravityScale = 1.6f;
	M->MaxAcceleration = 3000.f;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 520.f;
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 12.f;
	CameraBoom->SocketOffset = FVector(0.f, 0.f, 90.f);
	CameraBoom->ProbeSize = 16.f;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->SetFieldOfView(90.f);

	for (float& C : Cooldowns) C = 0.f;
}

// ============================================================================
// Setup
// ============================================================================

void ASlimeCharacter::BeginPlay()
{
	Super::BeginPlay();
	GraceFound.Init(false, SR::Graces().Num());
	if (GraceFound.Num() > 0) GraceFound[0] = true;
	BuildVisuals();
	ApplyClass(ClassId, true);
	LastSafe = GetActorLocation();
}

void ASlimeCharacter::BuildVisuals()
{
	VisualSpin = SR::AddPivot(this, GetCapsuleComponent(), FVector::ZeroVector);

	// Slime: a jelly drop with big eyes
	SlimeRoot = SR::AddPivot(this, VisualSpin, FVector(0, 0, -45.f));
	SlimeBody = SR::AddPivot(this, SlimeRoot, FVector::ZeroVector);
	UStaticMeshComponent* Body = SR::AddPart(this, SlimeBody, TEXT("Sphere"), FVector(0, 0, 42.f), FVector(0.95f, 0.95f, 0.84f), SlimeColor, FRotator::ZeroRotator, ESRMat::Slime);
	SlimeMid = Cast<UMaterialInstanceDynamic>(Body->GetMaterial(0));
	if (SlimeMid)
	{
		SlimeMid->SetScalarParameterValue(TEXT("Roughness"), 0.15f);
		SlimeMid->SetScalarParameterValue(TEXT("Opacity"), 0.78f);
	}
	SR::AddPart(this, SlimeBody, TEXT("Sphere"), FVector(-4.f, 0, 36.f), FVector(0.4f), FLinearColor(0.5f, 0.85f, 1.f), FRotator::ZeroRotator, ESRMat::Fx, 1.5f);
	for (int32 Side = -1; Side <= 1; Side += 2)
	{
		SlimeEyes.Add(SR::AddPart(this, SlimeBody, TEXT("Sphere"), FVector(40.f, Side * 14.f, 52.f), FVector(0.05f, 0.075f, 0.15f), FLinearColor(0.01f, 0.01f, 0.02f)));
		SR::AddPart(this, SlimeBody, TEXT("Sphere"), FVector(44.5f, Side * 12.5f, 57.f), FVector(0.022f), FLinearColor::White, FRotator::ZeroRotator, ESRMat::Fx, 3.f);
	}
	SlimeCrown = SR::AddPivot(this, SlimeBody, FVector(0, 0, 80.f));
	SR::AddPart(this, SlimeCrown, TEXT("Cylinder"), FVector::ZeroVector, FVector(0.36f, 0.36f, 0.1f), SR::Hex(0xe8c040));
	for (int32 k = 0; k < 6; ++k)
	{
		const FVector P = FRotator(0, k * 60.f, 0).Vector() * 15.f;
		SR::AddPart(this, SlimeCrown, TEXT("Cone"), FVector(P.X, P.Y, 10.f), FVector(0.07f, 0.07f, 0.14f), SR::Hex(0xe8c040));
	}
	SR::AddPart(this, SlimeCrown, TEXT("Sphere"), FVector(16.f, 0, 4.f), FVector(0.06f), FLinearColor(1.f, 0.1f, 0.2f), FRotator::ZeroRotator, ESRMat::Fx, 6.f);

	// Human (Mimetismo) and storm-wolf forms
	HumanBase = SR::AddPivot(this, VisualSpin, FVector(0, 0, -92.f));
	WolfBase = SR::AddPivot(this, VisualSpin, FVector(0, 0, -62.f));
	WolfRig = SR::BuildWolf(this, WolfBase, SR::Hex(0x2c3242), FLinearColor(0.25f, 0.85f, 1.f), 1.25f);
}

void ASlimeCharacter::BuildHuman()
{
	if (HumanRig.Root)
	{
		TArray<USceneComponent*> Children;
		HumanRig.Root->GetChildrenComponents(true, Children);
		for (USceneComponent* C : Children)
		{
			if (C) C->DestroyComponent();
		}
		HumanRig.Root->DestroyComponent();
		HumanRig = FSRRig();
	}

	FSRHumanStyle S;
	switch (ClassId)
	{
	case ESRClass::Slime:
		S.Hair = SR::Hex(0xa9cbe8); S.bLongHair = true; S.Skin = SR::Hex(0xf3dcc8);
		S.Eyes = FLinearColor(1.f, 0.75f, 0.2f); S.bGlowEyes = true;
		S.Shirt = SR::Hex(0x1e2236); S.Pants = SR::Hex(0x14161f); S.bCape = true; S.Cape = SR::Hex(0x2a3a6a);
		S.Accent = SR::Hex(0xd8b04a); S.Weapon = 1; S.Height = 0.97f;
		break;
	case ESRClass::Swordsman:
		S.Hair = SR::Hex(0x3a2a1a); S.Shirt = SR::Hex(0x7a808c); S.Pants = SR::Hex(0x3a3e46); S.bCape = true; S.Cape = SR::Hex(0x8c1c1c);
		S.Weapon = 1; S.Bulk = 1.12f; S.Height = 1.03f;
		break;
	case ESRClass::Mage:
		S.Hair = SR::Hex(0xe6e6f2); S.bLongHair = true; S.Shirt = SR::Hex(0x3a2a6a); S.bSkirt = true; S.bCape = true; S.Cape = SR::Hex(0x5a3a9a);
		S.Accent = FLinearColor(0.25f, 0.75f, 1.f); S.Weapon = 3; S.Eyes = SR::Hex(0x3a6ab0);
		break;
	case ESRClass::Emperor:
		S.Hair = SR::Hex(0x101018); S.bLongHair = true; S.Skin = SR::Hex(0xf0d6c0);
		S.Eyes = FLinearColor(1.f, 0.25f, 0.05f); S.bGlowEyes = true;
		S.Shirt = SR::Hex(0x1a1020); S.Pants = SR::Hex(0x0e0a12); S.bCape = true; S.Cape = SR::Hex(0x4a1a6a);
		S.Accent = SR::Hex(0xe8c040); S.bCrown = true; S.Weapon = 6; S.Height = 1.04f; S.Bulk = 1.08f;
		break;
	}
	HumanRig = SR::BuildHumanoid(this, HumanBase, S);
	if (ClassId == ESRClass::Mage && HumanRig.Head)
	{
		SR::AddPart(this, HumanRig.Head, TEXT("Cylinder"), FVector(0, 0, 30.f), FVector(0.62f, 0.62f, 0.03f), SR::Hex(0x2a1f4a));
		SR::AddPart(this, HumanRig.Head, TEXT("Cone"), FVector(-4.f, 0, 56.f), FVector(0.38f, 0.38f, 0.55f), SR::Hex(0x2a1f4a), FRotator(-10.f, 0, 0));
	}
}

void ASlimeCharacter::SetupPlayerInputComponent(UInputComponent* IC)
{
	Super::SetupPlayerInputComponent(IC);
	IC->BindAxis(TEXT("MoveForward"), this, &ASlimeCharacter::MoveForward);
	IC->BindAxis(TEXT("MoveRight"), this, &ASlimeCharacter::MoveRight);
	IC->BindAxis(TEXT("Turn"), this, &ASlimeCharacter::Turn);
	IC->BindAxis(TEXT("TurnRate"), this, &ASlimeCharacter::TurnRate);
	IC->BindAxis(TEXT("LookUp"), this, &ASlimeCharacter::LookUp);
	IC->BindAxis(TEXT("LookUpRate"), this, &ASlimeCharacter::LookUpRate);
	IC->BindAxis(TEXT("Zoom"), this, &ASlimeCharacter::Zoom);

	IC->BindAction(TEXT("Jump"), IE_Pressed, this, &ASlimeCharacter::DoJump);
	IC->BindAction(TEXT("Jump"), IE_Released, this, &ASlimeCharacter::StopJump);
	IC->BindAction(TEXT("Sprint"), IE_Pressed, this, &ASlimeCharacter::SprintOn);
	IC->BindAction(TEXT("Sprint"), IE_Released, this, &ASlimeCharacter::SprintOff);
	IC->BindAction(TEXT("Dodge"), IE_Pressed, this, &ASlimeCharacter::Dodge);
	IC->BindAction(TEXT("Attack"), IE_Pressed, this, &ASlimeCharacter::Attack);
	IC->BindAction(TEXT("Heavy"), IE_Pressed, this, &ASlimeCharacter::Heavy);
	IC->BindAction(TEXT("Absorb"), IE_Pressed, this, &ASlimeCharacter::Absorb);
	IC->BindAction(TEXT("Skill1"), IE_Pressed, this, &ASlimeCharacter::CastSelected);
	IC->BindAction(TEXT("Skill2"), IE_Pressed, this, &ASlimeCharacter::NextSkill);
	IC->BindAction(TEXT("Interact"), IE_Pressed, this, &ASlimeCharacter::Interact);
	IC->BindAction(TEXT("Transform"), IE_Pressed, this, &ASlimeCharacter::Transform);
	IC->BindAction(TEXT("Heal"), IE_Pressed, this, &ASlimeCharacter::UsePotion);
	IC->BindAction(TEXT("Help"), IE_Pressed, this, &ASlimeCharacter::ToggleHelp);
	IC->BindAction(TEXT("LockOn"), IE_Pressed, this, &ASlimeCharacter::ToggleLock);

	IC->BindKey(EKeys::One, IE_Pressed, this, &ASlimeCharacter::Num1);
	IC->BindKey(EKeys::Two, IE_Pressed, this, &ASlimeCharacter::Num2);
	IC->BindKey(EKeys::Three, IE_Pressed, this, &ASlimeCharacter::Num3);
	IC->BindKey(EKeys::Four, IE_Pressed, this, &ASlimeCharacter::Num4);
	IC->BindKey(EKeys::Five, IE_Pressed, this, &ASlimeCharacter::Num5);
	IC->BindKey(EKeys::Six, IE_Pressed, this, &ASlimeCharacter::Num6);
	IC->BindKey(EKeys::Seven, IE_Pressed, this, &ASlimeCharacter::Num7);
	IC->BindKey(EKeys::Eight, IE_Pressed, this, &ASlimeCharacter::Num8);
	IC->BindKey(EKeys::Nine, IE_Pressed, this, &ASlimeCharacter::Num9);
	IC->BindKey(EKeys::Enter, IE_Pressed, this, &ASlimeCharacter::MenuStart);
	IC->BindKey(EKeys::C, IE_Pressed, this, &ASlimeCharacter::MenuContinue);
	IC->BindKey(EKeys::Gamepad_Special_Right, IE_Pressed, this, &ASlimeCharacter::MenuStart);
}

ASRHUD* ASlimeCharacter::GetSRHUD() const
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	return PC ? Cast<ASRHUD>(PC->GetHUD()) : nullptr;
}

ASRGameMode* ASlimeCharacter::GetGM() const
{
	return GetWorld() ? GetWorld()->GetAuthGameMode<ASRGameMode>() : nullptr;
}

bool ASlimeCharacter::InMenu() const
{
	const ASRGameMode* GM = GetGM();
	return GM && GM->bInMenu;
}

bool ASlimeCharacter::CanAct() const
{
	return !InMenu() && !bDead && !bGraceMenu;
}

// ============================================================================
// Progression
// ============================================================================

static void SkillsForLevel(ESRClass C, int32 L, TArray<ESRSkill>& Out)
{
	switch (C)
	{
	case ESRClass::Slime:
		if (L == 1) Out.Add(ESRSkill::WaterBlade);
		if (L == 4) Out.Add(ESRSkill::Regen);
		if (L == 9) Out.Add(ESRSkill::Thunder);
		break;
	case ESRClass::Swordsman:
		if (L == 1) Out.Add(ESRSkill::BlackSlash);
		if (L == 3) Out.Add(ESRSkill::Shockwave);
		if (L == 6) Out.Add(ESRSkill::Regen);
		if (L == 10) Out.Add(ESRSkill::WaterBlade);
		break;
	case ESRClass::Mage:
		if (L == 1) { Out.Add(ESRSkill::Fireball); Out.Add(ESRSkill::Thunder); }
		if (L == 3) Out.Add(ESRSkill::WaterBlade);
		if (L == 5) Out.Add(ESRSkill::FireBreath);
		if (L == 7) Out.Add(ESRSkill::Regen);
		if (L == 10) Out.Add(ESRSkill::StickyThread);
		break;
	case ESRClass::Emperor:
		if (L == 1)
		{
			for (int32 i = 1; i < static_cast<int32>(ESRSkill::MAX); ++i) Out.Add(static_cast<ESRSkill>(i));
		}
		break;
	}
}

bool ASlimeCharacter::IsPredator() const
{
	return SR::Class(ClassId).bPredator;
}

bool ASlimeCharacter::CanTransform() const
{
	return ClassId == ESRClass::Slime || ClassId == ESRClass::Emperor;
}

void ASlimeCharacter::ApplyClass(ESRClass NewClass, bool bFresh)
{
	ClassId = NewClass;
	if (bFresh)
	{
		Level = 1;
		XP = 0.f;
		Gold = NewClass == ESRClass::Emperor ? 500 : 60;
		Potions = 3;
		WeaponLevel = 0;
		BonusHP = 0.f;
		Absorbed = 0;
		Skills.Reset();
		SelectedSkill = 0;
		bHasWolf = NewClass == ESRClass::Emperor;
		TArray<ESRSkill> Start;
		SkillsForLevel(NewClass, 1, Start);
		for (ESRSkill S : Start) LearnSkill(S, false);
		for (float& C : Cooldowns) C = 0.f;
	}
	SlimeColor = NewClass == ESRClass::Emperor ? FLinearColor(0.35f, 0.12f, 1.f) : FLinearColor(0.08f, 0.45f, 1.f);
	if (SlimeMid) SlimeMid->SetVectorParameterValue(TEXT("Color"), SlimeColor);
	BuildHuman();
	Recalc();
	if (bFresh)
	{
		HP = MaxHP;
		MP = MaxMP;
		Stamina = MaxStamina;
	}
	SetForm(CanTransform() ? ESRForm::Slime : ESRForm::Human, false);
}

void ASlimeCharacter::Recalc()
{
	const FSRClassInfo& C = SR::Class(ClassId);
	const float L = static_cast<float>(Level - 1);
	MaxHP = C.HP * (1.f + 0.12f * L) + BonusHP;
	MaxMP = C.MP * (1.f + 0.08f * L);
	MaxStamina = 100.f + L * 3.f;
	HP = FMath::Min(HP, MaxHP);
	MP = FMath::Min(MP, MaxMP);
}

float ASlimeCharacter::GetAttack() const
{
	const FSRClassInfo& C = SR::Class(ClassId);
	return C.Atk * (1.f + 0.1f * (Level - 1)) + WeaponLevel * 4.f + Absorbed * 0.15f;
}

void ASlimeCharacter::GiveXP(float Amount)
{
	if (ClassId == ESRClass::Emperor) Amount *= 2.f;
	XP += Amount;
	bool bUp = false;
	while (XP >= SR::XPForLevel(Level) && Level < 99)
	{
		XP -= SR::XPForLevel(Level);
		++Level;
		bUp = true;
		TArray<ESRSkill> New;
		SkillsForLevel(ClassId, Level, New);
		for (ESRSkill S : New) LearnSkill(S, true);
	}
	if (bUp)
	{
		Recalc();
		HP = MaxHP;
		MP = MaxMP;
		Toast(FString::Printf(TEXT("LIVELLO %d"), Level), TEXT("Vita, mana e attacco aumentati"));
		Oracle(FString::Printf(TEXT("Notifica: livello aumentato a %d. Attacco %d, Vita %d."), Level, FMath::RoundToInt(GetAttack()), FMath::RoundToInt(MaxHP)));
		ASRFx::Spawn(GetWorld(), ESRFxKind::Pillar, GetActorLocation(), FLinearColor(1.f, 0.85f, 0.35f), 120.f, 0.9f);
		if (ASRGameMode* GM = GetGM()) GM->SaveProgress();
	}
}

void ASlimeCharacter::GiveGold(int32 Amount)
{
	Gold += Amount;
}

bool ASlimeCharacter::LearnSkill(ESRSkill Skill, bool bAnnounce)
{
	if (Skill == ESRSkill::None || Skill == ESRSkill::MAX || Skills.Contains(Skill)) return false;
	Skills.Add(Skill);
	if (bAnnounce)
	{
		Oracle(FString::Printf(TEXT("Abilita' acquisita: %s. %s"), SR::Skill(Skill).Name, SR::Skill(Skill).Desc));
		Toast(TEXT("ABILITA' ACQUISITA"), SR::Skill(Skill).Name);
	}
	return true;
}

void ASlimeCharacter::UnlockForm(ESRForm NewForm)
{
	if (NewForm == ESRForm::Wolf && !bHasWolf && CanTransform())
	{
		bHasWolf = true;
		Oracle(TEXT("Analisi completata: Forma Lupo Tempesta disponibile. Premi G per trasformarti."));
		Toast(TEXT("NUOVA FORMA"), TEXT("Lupo Tempesta"));
	}
}

void ASlimeCharacter::SetForm(ESRForm NewForm, bool bFx)
{
	float R = 45.f, HH = 45.f, Walk = 520.f, Jump = 780.f, Arm = 520.f;
	switch (NewForm)
	{
	case ESRForm::Human: R = 34.f; HH = 92.f; Walk = 600.f; Jump = 640.f; Arm = 430.f; break;
	case ESRForm::Wolf: R = 48.f; HH = 62.f; Walk = 780.f; Jump = 720.f; Arm = 560.f; break;
	default: break;
	}
	const float OldHH = GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
	GetCapsuleComponent()->SetCapsuleSize(R, HH);
	if (HH > OldHH) AddActorWorldOffset(FVector(0, 0, HH - OldHH + 2.f));
	Form = NewForm;
	BaseWalk = Walk;
	GetCharacterMovement()->JumpZVelocity = Jump;
	TargetArm = Arm;

	if (SlimeRoot) SlimeRoot->SetVisibility(Form == ESRForm::Slime, true);
	if (SlimeCrown) SlimeCrown->SetVisibility(Form == ESRForm::Slime && ClassId == ESRClass::Emperor, true);
	HumanRig.SetVisible(Form == ESRForm::Human);
	WolfRig.SetVisible(Form == ESRForm::Wolf);

	if (bFx)
	{
		ASRFx::Spawn(GetWorld(), ESRFxKind::Burst, GetActorLocation(), SlimeColor, 220.f, 0.4f);
		ASRFx::Spawn(GetWorld(), ESRFxKind::Ring, GetActorLocation() - FVector(0, 0, HH - 5.f), SlimeColor, 300.f, 0.5f);
		static const TCHAR* Names[] = { TEXT("Forma Slime"), TEXT("Forma Umana"), TEXT("Forma Lupo Tempesta") };
		Oracle(FString::Printf(TEXT("Mimetismo: %s."), Names[static_cast<int32>(Form)]));
	}
}

// ============================================================================
// Input
// ============================================================================

FVector ASlimeCharacter::InputDirection() const
{
	if (MoveInput.IsNearlyZero() || !Controller) return FVector::ZeroVector;
	const FRotator Yaw(0, Controller->GetControlRotation().Yaw, 0);
	const FVector F = FRotationMatrix(Yaw).GetUnitAxis(EAxis::X);
	const FVector R = FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y);
	return (F * MoveInput.Y + R * MoveInput.X).GetSafeNormal();
}

void ASlimeCharacter::MoveForward(float V)
{
	MoveInput.Y = V;
	if (!CanAct() || FMath::IsNearlyZero(V) || !Controller) return;
	const FRotator Yaw(0, Controller->GetControlRotation().Yaw, 0);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), V);
}

void ASlimeCharacter::MoveRight(float V)
{
	MoveInput.X = V;
	if (!CanAct() || FMath::IsNearlyZero(V) || !Controller) return;
	const FRotator Yaw(0, Controller->GetControlRotation().Yaw, 0);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), V);
}

void ASlimeCharacter::Turn(float V)
{
	if (!InMenu() && !LockTarget.IsValid()) AddControllerYawInput(V);
}

void ASlimeCharacter::TurnRate(float V)
{
	if (!InMenu() && !LockTarget.IsValid()) AddControllerYawInput(V * 50.f * GetWorld()->GetDeltaSeconds());
}

void ASlimeCharacter::LookUp(float V)
{
	if (!InMenu()) AddControllerPitchInput(V);
}

void ASlimeCharacter::LookUpRate(float V)
{
	if (!InMenu()) AddControllerPitchInput(V * 40.f * GetWorld()->GetDeltaSeconds());
}

void ASlimeCharacter::Zoom(float V)
{
	if (!FMath::IsNearlyZero(V)) ZoomMul = FMath::Clamp(ZoomMul + V * 0.1f, 0.5f, 2.2f);
}

void ASlimeCharacter::DoJump()
{
	if (InMenu()) { MenuStart(); return; }
	if (!CanAct()) return;
	Jump();
}

void ASlimeCharacter::StopJump()
{
	StopJumping();
}

void ASlimeCharacter::SprintOn() { bSprinting = true; }
void ASlimeCharacter::SprintOff() { bSprinting = false; }

void ASlimeCharacter::ToggleHelp()
{
	bShowHelp = !bShowHelp;
}

void ASlimeCharacter::MenuStart()
{
	if (ASRGameMode* GM = GetGM())
	{
		if (GM->bInMenu) GM->StartGame(false);
	}
}

void ASlimeCharacter::MenuContinue()
{
	if (ASRGameMode* GM = GetGM())
	{
		if (GM->bInMenu && GM->bHasSave) GM->StartGame(true);
	}
}

void ASlimeCharacter::OnNumber(int32 N)
{
	if (ASRGameMode* GM = GetGM())
	{
		if (GM->bInMenu)
		{
			if (N >= 1 && N <= 4) GM->MenuClass = N - 1;
			return;
		}
	}
	if (bGraceMenu)
	{
		TravelToGrace(N - 1);
		return;
	}
	if (Skills.IsValidIndex(N - 1)) SelectedSkill = N - 1;
}

void ASlimeCharacter::NextSkill()
{
	if (InMenu())
	{
		if (ASRGameMode* GM = GetGM()) GM->MenuClass = (GM->MenuClass + 1) % 4;
		return;
	}
	if (Skills.Num() > 0) SelectedSkill = (SelectedSkill + 1) % Skills.Num();
}

void ASlimeCharacter::ToggleLock()
{
	if (LockTarget.IsValid())
	{
		LockTarget = nullptr;
		return;
	}
	LockTarget = FindTarget(3200.f, 0.2f);
}

void ASlimeCharacter::UsePotion()
{
	if (InMenu())
	{
		if (ASRGameMode* GM = GetGM()) GM->MenuClass = (GM->MenuClass + 3) % 4;
		return;
	}
	if (!CanAct() || PotionCooldown > 0.f) return;
	if (Potions <= 0)
	{
		Oracle(TEXT("Nessuna pozione rimasta. Elia le vende al mercato di Altheria."));
		return;
	}
	if (HP >= MaxHP) return;
	--Potions;
	PotionCooldown = 1.2f;
	HP = FMath::Min(MaxHP, HP + MaxHP * 0.5f);
	ASRFx::Spawn(GetWorld(), ESRFxKind::Burst, GetActorLocation(), FLinearColor(0.2f, 1.f, 0.4f), 160.f, 0.45f);
	if (ASRHUD* H = GetSRHUD()) H->DamageNumber(GetActorLocation() + FVector(0, 0, 120.f), MaxHP * 0.5f, FLinearColor(0.3f, 1.f, 0.4f), TEXT("+"));
}

void ASlimeCharacter::Transform()
{
	if (InMenu())
	{
		if (ASRGameMode* GM = GetGM()) GM->MenuClass = (GM->MenuClass + 1) % 4;
		return;
	}
	if (!CanAct() || AttackTime >= 0.f) return;
	if (!CanTransform())
	{
		Oracle(TEXT("Solo gli slime (e l'Imperatore) conoscono il Mimetismo."));
		return;
	}
	TArray<ESRForm> Forms = { ESRForm::Slime, ESRForm::Human };
	if (bHasWolf) Forms.Add(ESRForm::Wolf);
	const int32 Cur = Forms.IndexOfByKey(Form);
	SetForm(Forms[(Cur + 1) % Forms.Num()], true);
}

// ============================================================================
// Interaction
// ============================================================================

ASRNPC* ASlimeCharacter::FindNPC(float MaxDist) const
{
	ASRNPC* Best = nullptr;
	float BestD = MaxDist;
	for (TActorIterator<ASRNPC> It(GetWorld()); It; ++It)
	{
		const float D = FVector::Dist(It->GetActorLocation(), GetActorLocation());
		if (D < BestD) { BestD = D; Best = *It; }
	}
	return Best;
}

int32 ASlimeCharacter::FindGrace(float MaxDist) const
{
	const TArray<FSRGrace>& G = SR::Graces();
	for (int32 i = 0; i < G.Num(); ++i)
	{
		if (FVector::Dist2D(G[i].Location, GetActorLocation()) < MaxDist) return i;
	}
	return -1;
}

ASREnemy* ASlimeCharacter::FindCorpse(float MaxDist) const
{
	ASREnemy* Best = nullptr;
	float BestD = MaxDist;
	for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
	{
		if (!It->CanBeAbsorbed()) continue;
		const float D = FVector::Dist2D(It->GetActorLocation(), GetActorLocation());
		if (D < BestD) { BestD = D; Best = *It; }
	}
	return Best;
}

ASREnemy* ASlimeCharacter::FindTarget(float MaxDist, float MinDot) const
{
	ASREnemy* Best = nullptr;
	float BestScore = 1e12f;
	const FVector Fwd = Controller ? FRotator(0, Controller->GetControlRotation().Yaw, 0).Vector() : GetActorForwardVector();
	for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
	{
		if (It->IsDead()) continue;
		const FVector To = It->GetActorLocation() - GetActorLocation();
		const float D = To.Size();
		if (D > MaxDist) continue;
		const float Dot = FVector::DotProduct(Fwd, To.GetSafeNormal2D());
		if (Dot < MinDot) continue;
		const float Score = D * (2.2f - Dot);
		if (Score < BestScore) { BestScore = Score; Best = *It; }
	}
	return Best;
}

FString ASlimeCharacter::GetInteractPrompt() const
{
	if (InMenu() || bDead || bGraceMenu) return FString();
	if (const ASRNPC* N = FindNPC(330.f))
	{
		return FString::Printf(TEXT("[F] %s  -  %s"), *N->PromptVerb(), *N->NPCName);
	}
	if (FindGrace(450.f) >= 0) return TEXT("[F] Riposa alla Grazia  (salva, cura, viaggio rapido)");
	if (const ASREnemy* C = FindCorpse(450.f))
	{
		return FString::Printf(IsPredator() ? TEXT("[E] Predazione: %s") : TEXT("[E] Saccheggia: %s"), SR::Enemy(C->Kind).Name);
	}
	return FString();
}

void ASlimeCharacter::Interact()
{
	if (InMenu())
	{
		if (ASRGameMode* GM = GetGM()) GM->MenuClass = (GM->MenuClass + 1) % 4;
		return;
	}
	if (bDead) return;
	if (bGraceMenu)
	{
		bGraceMenu = false;
		return;
	}
	if (ASRNPC* N = FindNPC(330.f))
	{
		Say(N->NPCName, N->Interact(this));
		return;
	}
	if (DialogTime > 0.f)
	{
		DialogTime = 0.f;
		return;
	}
	const int32 G = FindGrace(450.f);
	if (G >= 0)
	{
		GraceFound[G] = true;
		LastGrace = G;
		HP = MaxHP;
		MP = MaxMP;
		Stamina = MaxStamina;
		Potions = FMath::Max(Potions, 3);
		bGraceMenu = true;
		ASRFx::Spawn(GetWorld(), ESRFxKind::Pillar, SR::Graces()[G].Location, FLinearColor(1.f, 0.8f, 0.4f), 90.f, 1.f);
		if (ASRGameMode* GM = GetGM())
		{
			GM->OnRest();
			GM->SaveProgress();
		}
		Oracle(TEXT("Riposo alla Grazia. Vita e mana ripristinati, partita salvata. Scegli una destinazione (1-8) o premi F."));
	}
}

void ASlimeCharacter::TravelToGrace(int32 Index)
{
	const TArray<FSRGrace>& G = SR::Graces();
	if (!G.IsValidIndex(Index) || !GraceFound.IsValidIndex(Index) || !GraceFound[Index]) return;
	bGraceMenu = false;
	LastGrace = Index;
	TeleportTo(G[Index].Location + FVector(250.f, 0.f, 0.f));
	Toast(G[Index].Name, TEXT("Viaggio rapido"));
}

void ASlimeCharacter::TeleportTo(const FVector& Location)
{
	const FVector P(Location.X, Location.Y, SR::HeightAt(Location.X, Location.Y) + GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight() + 30.f);
	SetActorLocation(P, false, nullptr, ETeleportType::TeleportPhysics);
	GetCharacterMovement()->StopMovementImmediately();
	LastSafe = P;
	ASRFx::Spawn(GetWorld(), ESRFxKind::Pillar, P, FLinearColor(1.f, 0.8f, 0.4f), 100.f, 0.8f);
}

void ASlimeCharacter::Absorb()
{
	if (!CanAct()) return;
	ASREnemy* C = FindCorpse(450.f);
	if (!C)
	{
		if (IsPredator()) Oracle(TEXT("Nessuna preda nelle vicinanze. Sconfiggi un nemico e premi E sul suo corpo."));
		return;
	}
	AbsorbEnemy(C);
}

void ASlimeCharacter::AbsorbEnemy(ASREnemy* Enemy)
{
	if (!Enemy || !Enemy->CanBeAbsorbed()) return;
	Enemy->MarkAbsorbed();
	AbsorbAnim = 0.7f;
	const FSREnemyInfo& Info = SR::Enemy(Enemy->Kind);
	if (IsPredator())
	{
		ASRFx::Spawn(GetWorld(), ESRFxKind::Vortex, Enemy->GetActorLocation(), SlimeColor, 220.f, 0.7f);
		++Absorbed;
		BonusHP += Enemy->bBoss ? 60.f : 3.f;
		MP = FMath::Min(MaxMP, MP + 12.f);
		Recalc();
		Oracle(FString::Printf(TEXT("Predazione: %s assorbito. Analisi in corso... Vita massima +%d."), Info.Name, Enemy->bBoss ? 60 : 3));
		if (Info.Grants != ESRSkill::None) LearnSkill(Info.Grants, true);
		if (Enemy->Kind == ESREnemyKind::Wolf) UnlockForm(ESRForm::Wolf);
	}
	else
	{
		ASRFx::Spawn(GetWorld(), ESRFxKind::Spark, Enemy->GetActorLocation(), FLinearColor(1.f, 0.85f, 0.3f), 160.f, 0.4f);
		const int32 Loot = 4 + Enemy->Level * 3;
		GiveGold(Loot);
		Oracle(FString::Printf(TEXT("Hai saccheggiato %s: %d oro."), Info.Name, Loot));
	}
}

// ============================================================================
// Combat
// ============================================================================

void ASlimeCharacter::Attack() { StartAttack(false); }
void ASlimeCharacter::Heavy() { StartAttack(true); }

void ASlimeCharacter::StartAttack(bool bHeavy)
{
	if (InMenu()) { MenuStart(); return; }
	if (!CanAct() || DodgeTime >= 0.f) return;
	if (AttackTime >= 0.f)
	{
		if (!bHeavy && AttackTime > AttackDuration * 0.45f) bQueuedAttack = true;
		return;
	}
	const float Cost = bHeavy ? 25.f : 7.f;
	if (Stamina < Cost) return;
	Stamina -= Cost;
	StaminaDelay = 0.9f;
	Combo = (ComboWindow > 0.f) ? (Combo + 1) % 3 : 0;
	bHeavyAttack = bHeavy;
	AttackTime = 0.f;
	bAttackHit = false;
	AttackDuration = bHeavy ? 0.8f : (Form == ESRForm::Wolf ? 0.3f : 0.42f);
	AttackHitAt = bHeavy ? 0.45f : (Form == ESRForm::Wolf ? 0.12f : 0.17f);

	FVector Face = FVector::ZeroVector;
	if (LockTarget.IsValid()) Face = (LockTarget->GetActorLocation() - GetActorLocation()).GetSafeNormal2D();
	else if (!InputDirection().IsNearlyZero()) Face = InputDirection();
	else if (ASREnemy* Near = FindTarget(500.f, -0.2f)) Face = (Near->GetActorLocation() - GetActorLocation()).GetSafeNormal2D();
	if (!Face.IsNearlyZero()) SetActorRotation(FRotator(0, Face.Rotation().Yaw, 0));
}

int32 ASlimeCharacter::MeleeHit(float Range, float MinDot, float Damage, float Knockback, bool bHeavy)
{
	int32 Hits = 0;
	const FVector Me = GetActorLocation();
	const FVector Fwd = GetActorForwardVector();
	for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
	{
		ASREnemy* E = *It;
		if (E->IsDead()) continue;
		const FVector To = E->GetActorLocation() - Me;
		if (To.Size2D() > Range + E->GetRadius() || FMath::Abs(To.Z) > 300.f + E->GetRadius()) continue;
		if (FVector::DotProduct(Fwd, To.GetSafeNormal2D()) < MinDot) continue;
		const bool bCrit = FMath::FRand() < 0.12f;
		const float Dmg = Damage * (bCrit ? 1.8f : 1.f) * FMath::FRandRange(0.92f, 1.08f);
		E->TakeHit(Dmg, this, Knockback, bHeavy);
		OnDealtDamage(E, Dmg, bCrit);
		ASRFx::Spawn(GetWorld(), ESRFxKind::Spark, E->GetActorLocation() + FVector(0, 0, 30.f), bCrit ? FLinearColor(1.f, 0.8f, 0.2f) : FLinearColor(1.f, 1.f, 1.f), bHeavy ? 220.f : 130.f, 0.2f);
		++Hits;
	}
	if (Hits > 0)
	{
		HitStop(bHeavy ? 0.09f : 0.045f);
		Shake(bHeavy ? 10.f : 4.f, 0.18f);
	}
	return Hits;
}

void ASlimeCharacter::OnDealtDamage(ASREnemy* Target, float Amount, bool bCrit)
{
	if (!Target) return;
	if (ASRHUD* H = GetSRHUD())
	{
		H->DamageNumber(Target->GetHeadLocation(), Amount, bCrit ? FLinearColor(1.f, 0.8f, 0.15f) : FLinearColor::White, bCrit ? TEXT("!") : TEXT(""));
	}
}

FVector ASlimeCharacter::AimDirection() const
{
	if (LockTarget.IsValid())
	{
		return (LockTarget->GetActorLocation() - GetActorLocation()).GetSafeNormal();
	}
	if (ASREnemy* T = FindTarget(2600.f, 0.85f))
	{
		return (T->GetActorLocation() - GetActorLocation()).GetSafeNormal();
	}
	FRotator R = Controller ? Controller->GetControlRotation() : GetActorRotation();
	R.Pitch = FMath::Clamp(static_cast<float>(FRotator::NormalizeAxis(R.Pitch)) + 8.f, -6.f, 25.f);
	return R.Vector();
}

void ASlimeCharacter::CastSelected()
{
	if (InMenu())
	{
		if (ASRGameMode* GM = GetGM()) GM->MenuClass = (GM->MenuClass + 1) % 4;
		return;
	}
	if (!CanAct() || !Skills.IsValidIndex(SelectedSkill)) return;
	CastSkill(Skills[SelectedSkill]);
}

void ASlimeCharacter::CastSkill(ESRSkill Skill)
{
	const FSRSkillInfo& Info = SR::Skill(Skill);
	const int32 SI = static_cast<int32>(Skill);
	if (Cooldowns[SI] > 0.f) return;
	if (MP < Info.Mana)
	{
		Oracle(TEXT("Mana insufficiente."));
		return;
	}
	MP -= Info.Mana;
	Cooldowns[SI] = Info.Cooldown * (ClassId == ESRClass::Emperor ? 0.5f : 1.f);
	CastAnim = 0.4f;

	UWorld* W = GetWorld();
	const FVector Me = GetActorLocation();
	const FVector Aim = AimDirection();
	const FVector Flat = FVector(Aim.X, Aim.Y, 0.f).GetSafeNormal();
	if (!Flat.IsNearlyZero()) SetActorRotation(FRotator(0, Flat.Rotation().Yaw, 0));
	const float Atk = GetAttack() * (Form == ESRForm::Human ? 1.1f : 1.f) * (ClassId == ESRClass::Mage ? 1.35f : 1.f);
	const float HalfH = GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
	const FVector Feet = Me - FVector(0, 0, HalfH - 5.f);

	auto AreaHit = [this, W](const FVector& Center, float Radius, float Damage, float Knock, bool bHeavy) -> int32
	{
		int32 N = 0;
		for (TActorIterator<ASREnemy> It(W); It; ++It)
		{
			ASREnemy* E = *It;
			if (E->IsDead()) continue;
			if (FVector::Dist2D(E->GetActorLocation(), Center) > Radius + E->GetRadius()) continue;
			const float Dmg = Damage * FMath::FRandRange(0.92f, 1.08f);
			E->TakeHit(Dmg, this, Knock, bHeavy);
			OnDealtDamage(E, Dmg, false);
			++N;
		}
		return N;
	};

	switch (Skill)
	{
	case ESRSkill::WaterBlade:
	case ESRSkill::Fireball:
	case ESRSkill::StickyThread:
	{
		const float Dmg = Skill == ESRSkill::WaterBlade ? Atk * 1.6f + 10.f : (Skill == ESRSkill::Fireball ? Atk * 2.2f + 20.f : Atk * 0.5f + 4.f);
		ASRProjectile::Fire(W, this, Me + Flat * 70.f + FVector(0, 0, 20.f), Aim, Skill, Dmg, false);
		break;
	}
	case ESRSkill::FireBreath:
	{
		for (int32 i = 1; i <= 6; ++i)
		{
			ASRFx::Spawn(W, ESRFxKind::Burst, Me + Flat * (i * 160.f) + FVector(0, 0, 20.f), Info.Color, 70.f + i * 30.f, 0.35f + i * 0.05f);
		}
		for (TActorIterator<ASREnemy> It(W); It; ++It)
		{
			ASREnemy* E = *It;
			if (E->IsDead()) continue;
			const FVector To = E->GetActorLocation() - Me;
			if (To.Size2D() > 1000.f || FVector::DotProduct(Flat, To.GetSafeNormal2D()) < 0.55f) continue;
			const float Dmg = Atk * 2.6f + 15.f;
			E->TakeHit(Dmg, this, 300.f, false);
			OnDealtDamage(E, Dmg, false);
		}
		Shake(5.f, 0.3f);
		break;
	}
	case ESRSkill::Thunder:
	{
		ASREnemy* T = LockTarget.IsValid() ? LockTarget.Get() : FindTarget(2800.f, 0.4f);
		FVector P = T ? T->GetActorLocation() : Me + Flat * 1200.f;
		P.Z = SR::HeightAt(P.X, P.Y);
		ASRFx::Spawn(W, ESRFxKind::Pillar, P, Info.Color, 140.f, 0.5f);
		ASRFx::Spawn(W, ESRFxKind::Ring, P, Info.Color, 420.f, 0.4f);
		AreaHit(P, 380.f, Atk * 3.f + 30.f, 200.f, true);
		int32 Chains = 0;
		for (TActorIterator<ASREnemy> It(W); It && Chains < 2; ++It)
		{
			ASREnemy* E = *It;
			if (E->IsDead() || E == T) continue;
			const float D = FVector::Dist2D(E->GetActorLocation(), P);
			if (D < 380.f || D > 1000.f) continue;
			ASRFx::Spawn(W, ESRFxKind::Pillar, E->GetActorLocation() - FVector(0, 0, 80.f), Info.Color, 70.f, 0.35f);
			const float Dmg = Atk * 1.5f + 15.f;
			E->TakeHit(Dmg, this, 100.f, false);
			OnDealtDamage(E, Dmg, false);
			++Chains;
		}
		Shake(9.f, 0.3f);
		break;
	}
	case ESRSkill::Shockwave:
		ASRFx::Spawn(W, ESRFxKind::Ring, Feet, Info.Color, 760.f, 0.55f);
		ASRFx::Spawn(W, ESRFxKind::Burst, Feet, Info.Color, 260.f, 0.3f);
		if (AreaHit(Feet, 760.f, Atk * 2.f + 15.f, 900.f, true) > 0) HitStop(0.07f);
		Shake(12.f, 0.4f);
		break;
	case ESRSkill::BlackSlash:
		SpinAnim = 0.4f;
		ASRFx::Spawn(W, ESRFxKind::Slash, Me, Info.Color, 470.f, 0.35f, GetActorRotation());
		if (AreaHit(Me, 470.f, Atk * 2.8f + 10.f, 600.f, true) > 0) HitStop(0.06f);
		Shake(6.f, 0.25f);
		break;
	case ESRSkill::Regen:
		HP = FMath::Min(MaxHP, HP + MaxHP * 0.45f);
		ASRFx::Spawn(W, ESRFxKind::Burst, Me, Info.Color, 220.f, 0.6f);
		ASRFx::Spawn(W, ESRFxKind::Ring, Feet, Info.Color, 300.f, 0.6f);
		if (ASRHUD* H = GetSRHUD()) H->DamageNumber(Me + FVector(0, 0, 120.f), MaxHP * 0.45f, Info.Color, TEXT("+"));
		break;
	case ESRSkill::Devour:
	{
		ASRFx::Spawn(W, ESRFxKind::Vortex, Me, Info.Color, 600.f, 1.1f);
		TArray<ASREnemy*> Eaten;
		for (TActorIterator<ASREnemy> It(W); It; ++It)
		{
			ASREnemy* E = *It;
			if (E->IsDead() || FVector::Dist(E->GetActorLocation(), Me) > 1700.f) continue;
			const FVector Pull = (Me - E->GetActorLocation()).GetSafeNormal2D();
			E->LaunchCharacter(Pull * 1300.f + FVector(0, 0, 250.f), true, true);
			const float Dmg = (Atk * 4.f + 60.f) * (E->bBoss ? 0.5f : 1.f);
			if (E->TakeHit(Dmg, this, 0.f, true)) Eaten.Add(E);
			OnDealtDamage(E, Dmg, true);
		}
		for (ASREnemy* E : Eaten) AbsorbEnemy(E);
		Shake(14.f, 0.6f);
		HitStop(0.1f);
		break;
	}
	default:
		break;
	}
}

void ASlimeCharacter::Dodge()
{
	if (!CanAct() || DodgeTime >= 0.f || Stamina < 18.f) return;
	Stamina -= 18.f;
	StaminaDelay = 0.8f;
	FVector Dir = InputDirection();
	if (Dir.IsNearlyZero()) Dir = -GetActorForwardVector();
	SetActorRotation(FRotator(0, Dir.Rotation().Yaw, 0));
	LaunchCharacter(Dir * (Form == ESRForm::Wolf ? 1900.f : 1500.f) + FVector(0, 0, 180.f), true, true);
	DodgeTime = 0.f;
	InvulnTime = 0.42f;
	AttackTime = -1.f;
	bQueuedAttack = false;
}

void ASlimeCharacter::ReceiveDamage(float Amount, AActor* Source)
{
	if (bDead || InMenu()) return;
	if (InvulnTime > 0.f)
	{
		if (ASRHUD* H = GetSRHUD()) H->DamageNumber(GetActorLocation() + FVector(0, 0, 100.f), 0.f, FLinearColor(0.6f, 0.9f, 1.f), TEXT("Schivata"));
		return;
	}
	float Dmg = Amount * (Form == ESRForm::Wolf ? 0.9f : 1.f) * (ClassId == ESRClass::Emperor ? 0.55f : 1.f);
	Dmg = FMath::Max(1.f, Dmg - WeaponLevel * 0.5f);
	HP -= Dmg;
	SinceHurt = 0.f;
	HurtFlash = 0.25f;
	Shake(9.f, 0.25f);
	if (ASRHUD* H = GetSRHUD()) H->DamageNumber(GetActorLocation() + FVector(0, 0, 100.f), Dmg, FLinearColor(1.f, 0.25f, 0.2f), TEXT("-"));
	if (Source)
	{
		const FVector Dir = (GetActorLocation() - Source->GetActorLocation()).GetSafeNormal2D();
		LaunchCharacter(Dir * 420.f + FVector(0, 0, 160.f), true, true);
	}
	if (HP <= 0.f)
	{
		HP = 0.f;
		Die();
	}
}

void ASlimeCharacter::Snare(float Seconds)
{
	SnareTime = FMath::Max(SnareTime, Seconds);
	Oracle(TEXT("Sei intrappolato nella ragnatela!"));
}

void ASlimeCharacter::Shake(float Amplitude, float Duration)
{
	if (Amplitude >= ShakeAmp * (ShakeDur > 0.f ? ShakeTime / ShakeDur : 0.f))
	{
		ShakeAmp = Amplitude;
		ShakeDur = Duration;
		ShakeTime = Duration;
	}
}

void ASlimeCharacter::HitStop(float Seconds)
{
	UGameplayStatics::SetGlobalTimeDilation(this, 0.06f);
	HitStopEnd = FPlatformTime::Seconds() + Seconds;
}

void ASlimeCharacter::Die()
{
	bDead = true;
	DeadTime = 0.f;
	LockTarget = nullptr;
	bGraceMenu = false;
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	if (VisualSpin) VisualSpin->SetVisibility(false, true);
	ASRFx::Spawn(GetWorld(), ESRFxKind::Burst, GetActorLocation(), SlimeColor, 300.f, 0.8f);
}

void ASlimeCharacter::RespawnAtGrace()
{
	const int32 Lost = Gold / 5;
	Gold -= Lost;
	bDead = false;
	HP = MaxHP;
	MP = MaxMP;
	Stamina = MaxStamina;
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	if (VisualSpin) VisualSpin->SetVisibility(true, true);
	SetForm(Form, false);
	const TArray<FSRGrace>& G = SR::Graces();
	if (G.IsValidIndex(LastGrace)) TeleportTo(G[LastGrace].Location + FVector(250.f, 0, 0));
	Oracle(FString::Printf(TEXT("Rinato presso la Grazia \"%s\". Hai perso %d oro."), G.IsValidIndex(LastGrace) ? *G[LastGrace].Name : TEXT("?"), Lost));
	if (ASRGameMode* GM = GetGM()) GM->OnRest();
}

void ASlimeCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);
	LandSquash = FMath::Clamp(AirTime * 1.5f, 0.2f, 1.f);
	AirTime = 0.f;
}

// ============================================================================
// UI helpers
// ============================================================================

void ASlimeCharacter::Oracle(const FString& Text)
{
	if (ASRHUD* H = GetSRHUD()) H->PushOracle(Text);
}

void ASlimeCharacter::Toast(const FString& Big, const FString& Small)
{
	if (ASRHUD* H = GetSRHUD()) H->ShowToast(Big, Small);
}

void ASlimeCharacter::Say(const FString& Speaker, const FString& Text)
{
	if (Text.IsEmpty()) return;
	DialogSpeaker = Speaker;
	DialogText = Text;
	DialogTime = 7.f;
}

// ============================================================================
// Tick
// ============================================================================

void ASlimeCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (HitStopEnd > 0.0 && FPlatformTime::Seconds() >= HitStopEnd)
	{
		UGameplayStatics::SetGlobalTimeDilation(this, 1.f);
		HitStopEnd = 0.0;
	}
	const float Dt = DeltaSeconds;
	Clock += Dt;

	// Title screen: slow cinematic orbit over the city
	if (InMenu())
	{
		if (Controller) Controller->SetControlRotation(FRotator(-14.f, Clock * 5.f, 0.f));
		CameraBoom->TargetArmLength = FMath::FInterpTo(CameraBoom->TargetArmLength, 1400.f, Dt, 2.f);
		UpdateAnimation(Dt);
		return;
	}

	if (bDead)
	{
		DeadTime += Dt;
		if (DeadTime > 4.5f) RespawnAtGrace();
		return;
	}

	// Timers
	for (float& C : Cooldowns) C = FMath::Max(0.f, C - Dt);
	PotionCooldown = FMath::Max(0.f, PotionCooldown - Dt);
	InvulnTime = FMath::Max(0.f, InvulnTime - Dt);
	SnareTime = FMath::Max(0.f, SnareTime - Dt);
	DialogTime = FMath::Max(0.f, DialogTime - Dt);
	HurtFlash = FMath::Max(0.f, HurtFlash - Dt);
	CastAnim = FMath::Max(0.f, CastAnim - Dt);
	SpinAnim = FMath::Max(0.f, SpinAnim - Dt);
	AbsorbAnim = FMath::Max(0.f, AbsorbAnim - Dt);
	LandSquash = FMath::Max(0.f, LandSquash - Dt * 4.f);
	ComboWindow = FMath::Max(0.f, ComboWindow - Dt);
	SinceHurt += Dt;
	if (GetCharacterMovement()->IsFalling()) AirTime += Dt;

	// Regeneration
	const bool bEmperor = ClassId == ESRClass::Emperor;
	MP = FMath::Min(MaxMP, MP + Dt * (bEmperor ? 9.f : 2.5f + Level * 0.12f));
	if (SinceHurt > 6.f) HP = FMath::Min(MaxHP, HP + Dt * MaxHP * (bEmperor ? 0.03f : 0.01f));
	const bool bMoving = GetVelocity().Size2D() > 50.f;
	if (bSprinting && bMoving && Stamina > 0.f)
	{
		Stamina = FMath::Max(0.f, Stamina - Dt * 15.f);
		StaminaDelay = 0.6f;
	}
	else if (StaminaDelay > 0.f)
	{
		StaminaDelay -= Dt;
	}
	else
	{
		Stamina = FMath::Min(MaxStamina, Stamina + Dt * 38.f);
	}

	// Speed
	float SpeedMul = (bSprinting && Stamina > 1.f) ? 1.65f : 1.f;
	if (AttackTime >= 0.f) SpeedMul *= 0.3f;
	if (SnareTime > 0.f) SpeedMul *= 0.25f;
	GetCharacterMovement()->MaxWalkSpeed = BaseWalk * SpeedMul;

	// Attack timeline
	if (AttackTime >= 0.f)
	{
		AttackTime += Dt;
		if (!bAttackHit && AttackTime >= AttackHitAt)
		{
			bAttackHit = true;
			float Range = 230.f, Mul = 1.f;
			if (Form == ESRForm::Human) { Range = 270.f; Mul = 1.25f; }
			if (Form == ESRForm::Wolf) { Range = 240.f; Mul = 1.12f; }
			if (Combo == 2) Mul *= 1.5f;
			if (bHeavyAttack) { Range += 100.f; Mul *= 2.4f; }
			LaunchCharacter(GetActorForwardVector() * (bHeavyAttack ? 650.f : 420.f), true, false);
			MeleeHit(Range, bHeavyAttack ? -0.25f : 0.2f, GetAttack() * Mul, bHeavyAttack ? 750.f : 320.f, bHeavyAttack);
			const FLinearColor SlashC = Form == ESRForm::Slime ? SlimeColor : FLinearColor(0.9f, 0.95f, 1.f);
			ASRFx::Spawn(GetWorld(), bHeavyAttack ? ESRFxKind::Ring : ESRFxKind::Slash,
				bHeavyAttack ? GetActorLocation() + GetActorForwardVector() * 150.f - FVector(0, 0, 40.f) : GetActorLocation() + GetActorForwardVector() * 120.f,
				SlashC, Range * 0.75f, 0.2f, GetActorRotation());
		}
		if (AttackTime >= AttackDuration)
		{
			AttackTime = -1.f;
			ComboWindow = 0.4f;
			if (bQueuedAttack)
			{
				bQueuedAttack = false;
				StartAttack(false);
			}
		}
	}
	if (DodgeTime >= 0.f)
	{
		DodgeTime += Dt;
		if (DodgeTime > 0.45f) DodgeTime = -1.f;
	}

	// Lock-on camera
	if (LockTarget.IsValid())
	{
		ASREnemy* T = LockTarget.Get();
		if (T->IsDead() || FVector::Dist(T->GetActorLocation(), GetActorLocation()) > 4500.f)
		{
			LockTarget = nullptr;
		}
		else if (Controller)
		{
			const FVector To = T->GetActorLocation() - GetActorLocation();
			FRotator Want = To.Rotation();
			Want.Pitch = FMath::Clamp(static_cast<float>(Want.Pitch) - 12.f, -35.f, 10.f);
			Controller->SetControlRotation(FMath::RInterpTo(Controller->GetControlRotation(), Want, Dt, 8.f));
			if (AttackTime < 0.f && DodgeTime < 0.f && !bSprinting)
			{
				SetActorRotation(FMath::RInterpTo(GetActorRotation(), FRotator(0, Want.Yaw, 0), Dt, 10.f));
			}
		}
	}
	GetCharacterMovement()->bOrientRotationToMovement = !(LockTarget.IsValid() && !bSprinting);

	// Camera
	const float FovWant = (bSprinting && bMoving) ? 100.f : 90.f;
	FollowCamera->SetFieldOfView(FMath::FInterpTo(FollowCamera->FieldOfView, FovWant, Dt, 5.f));
	CameraBoom->TargetArmLength = FMath::FInterpTo(CameraBoom->TargetArmLength, TargetArm * ZoomMul, Dt, 4.f);
	if (ShakeTime > 0.f)
	{
		ShakeTime -= Dt;
		const float A = ShakeAmp * FMath::Max(0.f, ShakeTime) / FMath::Max(0.01f, ShakeDur);
		FollowCamera->SetRelativeLocation(FVector(0.f, FMath::FRandRange(-A, A), FMath::FRandRange(-A, A)));
	}
	else
	{
		FollowCamera->SetRelativeLocation(FVector::ZeroVector);
	}

	UpdateWorldChecks(Dt);
	UpdateAnimation(Dt);
}

void ASlimeCharacter::UpdateWorldChecks(float Dt)
{
	const FVector P = GetActorLocation();
	const float Ground = SR::HeightAt(P.X, P.Y);

	// Fell through the world: put back on the surface
	if (P.Z < Ground - 400.f)
	{
		SetActorLocation(FVector(P.X, P.Y, Ground + 200.f), false, nullptr, ETeleportType::TeleportPhysics);
		GetCharacterMovement()->StopMovementImmediately();
	}
	// Deep water: no swimming yet, bounce back to the last safe spot
	WaterWarn = FMath::Max(0.f, WaterWarn - Dt);
	if (Ground < -140.f && P.Z < 120.f)
	{
		SetActorLocation(LastSafe, false, nullptr, ETeleportType::TeleportPhysics);
		GetCharacterMovement()->StopMovementImmediately();
		if (WaterWarn <= 0.f)
		{
			Oracle(TEXT("Acque profonde: non sai ancora nuotare. (Arriva nella prossima versione!)"));
			WaterWarn = 6.f;
		}
	}
	else
	{
		SafeTimer += Dt;
		if (SafeTimer > 0.5f && !GetCharacterMovement()->IsFalling() && Ground > 30.f)
		{
			SafeTimer = 0.f;
			LastSafe = P + FVector(0, 0, 20.f);
		}
	}

	// Discover Sites of Grace
	const TArray<FSRGrace>& G = SR::Graces();
	for (int32 i = 0; i < G.Num(); ++i)
	{
		if (GraceFound.IsValidIndex(i) && !GraceFound[i] && FVector::Dist2D(G[i].Location, P) < 1500.f)
		{
			GraceFound[i] = true;
			Toast(TEXT("GRAZIA SCOPERTA"), G[i].Name);
		}
	}

	// Region banner
	RegionTimer -= Dt;
	if (RegionTimer <= 0.f)
	{
		RegionTimer = 1.f;
		const FString Region = SR::RegionName(P);
		if (Region != LastRegion)
		{
			if (!LastRegion.IsEmpty()) Toast(Region, TEXT(""));
			LastRegion = Region;
		}
	}
}

void ASlimeCharacter::UpdateAnimation(float Dt)
{
	const FVector Vel = GetVelocity();
	const float Speed = Vel.Size2D();
	const bool bFalling = GetCharacterMovement()->IsFalling();
	const float Amount = FMath::Clamp(Speed / 600.f, 0.f, 1.f);
	WalkPhase += Dt * (4.f + Speed * 0.011f);
	const float AttackP = AttackTime >= 0.f ? FMath::Clamp(AttackTime / AttackDuration, 0.f, 1.f) : -1.f;

	// Dodge roll / spin
	if (VisualSpin)
	{
		FRotator Spin = FRotator::ZeroRotator;
		if (DodgeTime >= 0.f) Spin.Pitch = -360.f * FMath::Clamp(DodgeTime / 0.42f, 0.f, 1.f);
		if (SpinAnim > 0.f) Spin.Yaw = 360.f * (1.f - SpinAnim / 0.4f);
		VisualSpin->SetRelativeRotation(Spin);
	}

	// Hurt flash
	const float Flash = HurtFlash / 0.25f;
	if (SlimeMid) SlimeMid->SetVectorParameterValue(TEXT("Color"), FMath::Lerp(SlimeColor, FLinearColor(1.f, 0.1f, 0.05f), Flash));

	if (Form == ESRForm::Slime && SlimeBody)
	{
		const float Hop = (!bFalling && Amount > 0.05f) ? FMath::Abs(FMath::Sin(WalkPhase)) : 0.f;
		float SX = 1.f + 0.035f * FMath::Sin(Clock * 3.f);
		float SZ = 1.f - 0.035f * FMath::Sin(Clock * 3.f);
		FVector Off(0, 0, Hop * 28.f * Amount);
		SZ += Hop * 0.12f * Amount - (1.f - Hop) * 0.08f * Amount;
		SX -= Hop * 0.05f * Amount;
		if (bFalling)
		{
			const float St = FMath::Clamp(static_cast<float>(FMath::Abs(Vel.Z)) / 2200.f, 0.f, 0.3f);
			SZ += St;
			SX -= St * 0.5f;
		}
		SZ -= LandSquash * 0.35f;
		SX += LandSquash * 0.25f;
		if (AttackP >= 0.f)
		{
			const float S = FMath::Sin(AttackP * PI);
			if (bHeavyAttack)
			{
				Off.Z += S * 140.f;
				SZ += (AttackP > 0.6f ? -0.35f : 0.2f) * S;
			}
			else
			{
				Off.X += S * 45.f;
				SX += S * 0.35f;
				SZ -= S * 0.2f;
			}
		}
		if (CastAnim > 0.f) { const float C = FMath::Sin(CastAnim / 0.4f * PI); SX += C * 0.12f; SZ += C * 0.12f; }
		if (AbsorbAnim > 0.f) { const float A = FMath::Sin(AbsorbAnim / 0.7f * PI); SX += A * 0.5f; SZ += A * 0.3f; }
		SlimeBody->SetRelativeScale3D(FVector(SX, SX, SZ));
		SlimeBody->SetRelativeLocation(Off);

		const bool bBlink = FMath::Fmod(Clock, 3.7f) < 0.12f;
		for (UStaticMeshComponent* Eye : SlimeEyes)
		{
			if (Eye) Eye->SetRelativeScale3D(FVector(0.05f, 0.075f, bBlink ? 0.015f : 0.15f));
		}
	}
	else if (Form == ESRForm::Human && HumanRig.IsValid())
	{
		HumanRig.Flash(Flash, FLinearColor(1.f, 0.1f, 0.05f));
		HumanRig.Walk(WalkPhase * 0.8f, bFalling ? 0.f : Amount, Clock);
		if (bFalling)
		{
			if (HumanRig.LegL) HumanRig.LegL->SetRelativeRotation(FRotator(35.f, 0, 0));
			if (HumanRig.LegR) HumanRig.LegR->SetRelativeRotation(FRotator(-10.f, 0, 0));
			if (HumanRig.ArmL) HumanRig.ArmL->SetRelativeRotation(FRotator(30.f, 0, -30.f));
		}
		if (HumanRig.ArmR)
		{
			if (AttackP >= 0.f)
			{
				const float E = FMath::InterpEaseOut(0.f, 1.f, AttackP, 2.f);
				if (bHeavyAttack)
				{
					const float Up = AttackP < 0.55f ? AttackP / 0.55f : 1.f;
					const float Down = AttackP < 0.55f ? 0.f : (AttackP - 0.55f) / 0.45f;
					HumanRig.ArmR->SetRelativeRotation(FRotator(FMath::Lerp(0.f, 170.f, Up) - Down * 190.f, 0, 0));
					if (HumanRig.ArmL) HumanRig.ArmL->SetRelativeRotation(FRotator(FMath::Lerp(0.f, 170.f, Up) - Down * 190.f, 0, 0));
				}
				else if (Combo == 0)
				{
					HumanRig.ArmR->SetRelativeRotation(FRotator(FMath::Lerp(160.f, -10.f, E), 0, 0));
				}
				else if (Combo == 1)
				{
					HumanRig.ArmR->SetRelativeRotation(FRotator(80.f, FMath::Lerp(75.f, -75.f, E), 0));
				}
				else
				{
					HumanRig.ArmR->SetRelativeRotation(FRotator(90.f, 0, 0));
					if (HumanRig.Torso) HumanRig.Torso->SetRelativeRotation(FRotator(-12.f * FMath::Sin(AttackP * PI), FMath::Lerp(-40.f, 25.f, E), 0));
				}
			}
			else if (CastAnim > 0.f)
			{
				const float C = FMath::Sin(CastAnim / 0.4f * PI);
				HumanRig.ArmR->SetRelativeRotation(FRotator(95.f * C, 0, 0));
				if (HumanRig.ArmL) HumanRig.ArmL->SetRelativeRotation(FRotator(95.f * C, 0, 0));
			}
		}
	}
	else if (Form == ESRForm::Wolf && WolfRig.IsValid())
	{
		WolfRig.Flash(Flash, FLinearColor(1.f, 0.1f, 0.05f));
		WolfRig.Walk(WalkPhase * 0.9f, bFalling ? 0.3f : Amount, Clock);
		if (WolfRig.Head)
		{
			if (AttackP >= 0.f) WolfRig.Head->SetRelativeRotation(FRotator(-25.f * FMath::Sin(AttackP * PI), 0, 0));
			else if (CastAnim > 0.f) WolfRig.Head->SetRelativeRotation(FRotator(45.f * FMath::Sin(CastAnim / 0.4f * PI), 0, 0));
		}
	}
}
