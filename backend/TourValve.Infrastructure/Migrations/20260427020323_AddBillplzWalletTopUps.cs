using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBillplzWalletTopUps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ExternalReference",
                table: "WalletTopUpRequests",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "CallbackPayloadJson",
                table: "WalletTopUpRequests",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckoutUrl",
                table: "WalletTopUpRequests",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "CreditedAt",
                table: "WalletTopUpRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PaidAt",
                table: "WalletTopUpRequests",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "WalletTopUpRequests",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_WalletTopUpRequests_Provider_ExternalReference",
                table: "WalletTopUpRequests",
                columns: new[] { "Provider", "ExternalReference" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WalletTopUpRequests_Provider_ExternalReference",
                table: "WalletTopUpRequests");

            migrationBuilder.DropColumn(
                name: "CallbackPayloadJson",
                table: "WalletTopUpRequests");

            migrationBuilder.DropColumn(
                name: "CheckoutUrl",
                table: "WalletTopUpRequests");

            migrationBuilder.DropColumn(
                name: "CreditedAt",
                table: "WalletTopUpRequests");

            migrationBuilder.DropColumn(
                name: "PaidAt",
                table: "WalletTopUpRequests");

            migrationBuilder.DropColumn(
                name: "Provider",
                table: "WalletTopUpRequests");

            migrationBuilder.AlterColumn<string>(
                name: "ExternalReference",
                table: "WalletTopUpRequests",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(120)",
                oldMaxLength: 120);
        }
    }
}
