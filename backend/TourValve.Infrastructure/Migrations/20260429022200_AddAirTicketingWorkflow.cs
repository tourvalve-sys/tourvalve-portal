using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAirTicketingWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "AirTicketingDate",
                table: "Bookings",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AirTicketingFormOfPayment",
                table: "Bookings",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AirTicketingLastError",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AirTicketingPaymentStatus",
                table: "Bookings",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "UNPAID");

            migrationBuilder.AddColumn<DateTime>(
                name: "AirTicketingScheduledAt",
                table: "Bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AirTicketingScheduledByAgentId",
                table: "Bookings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AirTicketingStatus",
                table: "Bookings",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "NOT_STARTED");

            migrationBuilder.AddColumn<Guid>(
                name: "AirTicketingWalletHoldId",
                table: "Bookings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderCode",
                table: "Bookings",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TicketVoidResponseXml",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "TicketVoidedAt",
                table: "Bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_AirTicketingStatus_AirTicketingDate",
                table: "Bookings",
                columns: new[] { "AirTicketingStatus", "AirTicketingDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Bookings_AirTicketingStatus_AirTicketingDate",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingDate",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingFormOfPayment",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingLastError",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingPaymentStatus",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingScheduledAt",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingScheduledByAgentId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingStatus",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "AirTicketingWalletHoldId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "ProviderCode",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "TicketVoidResponseXml",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "TicketVoidedAt",
                table: "Bookings");
        }
    }
}
